/**
 * The finite Dev Mode commands and the hooks other commands run: `serverless dev setup`,
 * `serverless dev restore`, and the restore that `deploy`, `remove`, `rollback` and
 * `deploy function` run first. Those four never fail because of it: a denied check is a debug
 * line, any other problem a warning where a session ran (a debug line elsewhere).
 */
import {
  log,
  progress as defaultProgress,
  ServerlessError,
} from '@serverless/util'
import { BROKER_POLICY_NAME, brokerRoleName, functionKeyOf } from './naming.js'
import {
  PRE_COMMAND_CONNECTION_TIMEOUT_MS,
  PRE_COMMAND_RETRY,
  createDevModeClients,
  isAccessDenied,
  isCredentialError,
  originalOf,
  providerCallError,
} from './aws.js'
import { credentialSourceOf } from '../relay/messages.js'
import {
  findAttachedFunctions,
  restoreFunction,
  restoreFunctions,
} from './attach.js'
import { selectFunctions } from './eligibility.js'
import { deploymentExists } from '../../utils/deployment-exists.js'
import * as out from './output.js'
import {
  createBroker,
  getBroker,
  identityFrom,
  brokerPolicyIsNewer,
  putBrokerBoundary,
  putBrokerPolicy,
} from './broker.js'
import { devDirOf, devModeRanIn } from '../state/paths.js'
import { isSessionLive, readSession } from '../state/session-file.js'
import { healthOf } from '../control/client.js'
import { cliCommand } from '../commands/cli-names.js'
import { composeServiceOf, configOf } from '../../lib/cli-command.js'
import {
  awsProfileOf,
  errorResult,
  exitCodeOf,
  jsonRequested,
  printResult,
  restoreAfterStopNext,
  restoreCommand,
} from '../commands/envelope.js'
import { EMPTY_RESTORE, restoreCounts } from '../state/session-state.js'

const defaultLogger = log.get('sls:dev')
// IAM paths: "/" or "/<printable ASCII>/", at most 512 characters.
const IAM_PATH = /^\/(?:[\x21-\x7E]+\/)?$/
const DENIED_CODES = new Set([
  'DEV_MODE_BROKER_CREATE_DENIED',
  'DEV_MODE_BROKER_READ_DENIED',
  'DEV_MODE_BROKER_UNAVAILABLE',
])

const setupDenied = ({ region, name, error }) =>
  new ServerlessError(
    `Your AWS credentials cannot set up Dev Mode in ${region} (${error.originalMessage ?? error.message}).\n` +
      `"serverless dev setup" needs iam:GetRole, iam:GetRolePolicy, iam:CreateRole and iam:PutRolePolicy on the IAM role "${name}", plus iam:PutRolePermissionsBoundary when --permissions-boundary is given.\n` +
      'Run it again with the credentials of an AWS administrator.',
    'DEV_SETUP_ACCESS_DENIED',
    {
      ...originalOf(error),
      originalMessage: error.originalMessage ?? error.message,
    },
  )

const ensureBroker = async ({
  iam,
  name,
  identity,
  region,
  path,
  boundary,
  explicitPath,
}) => {
  let existing = await getBroker({
    iam,
    name,
    identity,
    region,
    retryCommand: cliCommand('dev setup'),
  })
  // createBroker puts the permission policy on a role a teammate created at the same moment.
  let policyPut = false
  if (!existing) {
    const created = await createBroker({
      iam,
      name,
      identity,
      region,
      permissionsBoundary: boundary,
      path,
      // dev setup never writes over a policy it cannot read.
      unreadablePolicy: 'stop',
    })
    if (created?.created) {
      return `created IAM role ${created.arn}${boundary ? ` with the permissions boundary ${boundary}` : ''}`
    }
    // A teammate created it at the same moment: continue as for an existing role.
    existing = created
    policyPut = Boolean(created)
    if (!existing) {
      throw new ServerlessError(
        `The IAM role "${name}" was being created by someone else at the same time. Run "${cliCommand('dev setup')}" again.`,
        'DEV_SETUP_CONCURRENT',
        { stack: false },
      )
    }
  }
  if (explicitPath && existing.path !== path) {
    throw new ServerlessError(
      `The IAM role "${name}" already exists with path "${existing.path}". IAM cannot move a role to another path: delete the role, then run "${cliCommand(`dev setup --path ${path}`)}" again.`,
      'DEV_SETUP_PATH_MISMATCH',
      { stack: false },
    )
  }
  // Read first: a read that is denied stops setup before anything changes. A policy a newer
  // version of Dev Mode wrote is left as it is: its bridges may need more.
  const keep = policyPut
    ? existing.policyKept
    : await brokerPolicyIsNewer({ iam, name, identity, region })
  if (boundary) await putBrokerBoundary({ iam, name, boundary })
  if (!policyPut && !keep)
    await putBrokerPolicy({ iam, name, identity, region })
  const written = !keep
  const policy = written
    ? `re-applied its permission policy ${BROKER_POLICY_NAME}`
    : `kept its permission policy ${BROKER_POLICY_NAME}, which a newer version of Dev Mode wrote`
  const boundarySet = boundary
    ? `${written ? '' : ','} and set the permissions boundary ${boundary}`
    : ''
  return `IAM role ${existing.arn} (already existed; ${policy}${boundarySet})`
}

export const runDevSetup = async ({ provider, options = {}, deps = {} }) => {
  const region = provider.getRegion()
  const {
    clients = createDevModeClients({ provider, region }),
    logger = defaultLogger,
    progress = defaultProgress,
  } = deps
  const name = brokerRoleName(region)
  const path = options.path ?? '/'
  if (!IAM_PATH.test(path) || path.length > 512) {
    throw new ServerlessError(
      `--path must start and end with "/" (for example "/serverless/"), got "${path}".`,
      'DEV_SETUP_INVALID_PATH',
      { stack: false },
    )
  }
  const boundary = options['permissions-boundary']
  const spinner = progress.get('dev-setup')
  spinner.notice(`Setting up Dev Mode in ${region}`)
  let summary
  try {
    let account
    try {
      account = await provider.getAccountInfo()
    } catch (error) {
      throw providerCallError(error, {
        region,
        credentialSource: credentialSourceOf(provider),
        action: 'sts:GetCallerIdentity',
        why: `in ${region} to read the AWS account to set up`,
        code: 'DEV_MODE_IDENTITY_ACCESS_DENIED',
      })
    }
    const identity = identityFrom({
      accountId: account.accountId,
      callerArn: account.arn,
    })
    summary = await ensureBroker({
      iam: clients.iam,
      name,
      identity,
      region,
      path,
      boundary,
      explicitPath: options.path !== undefined,
    })
  } catch (error) {
    if (DENIED_CODES.has(error?.code) || isAccessDenied(error)) {
      throw setupDenied({ region, name, error })
    }
    throw error
  } finally {
    spinner.remove()
  }
  logger.success(`Dev Mode is set up in ${region}: ${summary}`)
  logger.aside(
    'Developers can now run "serverless dev" in this account and region without permission to create IAM roles.',
  )
}

const deployedNames = (serverless, keys) =>
  keys.map((key) => serverless.service.getFunction(key).name)

/**
 * Dev Mode's clients for a command: `deps.clients` when given, else new ones with the retry
 * option `retry` (the full policy by default), the waits of `deps.sleep` and, when given,
 * `connectionTimeoutMs`.
 */
const clientsFor = (provider, deps, { retry = {}, connectionTimeoutMs } = {}) =>
  deps.clients ??
  createDevModeClients({
    provider,
    region: provider.getRegion(),
    sdk: deps.sdk,
    retry: { ...retry, ...(deps.sleep && { sleep: deps.sleep }) },
    connectionTimeoutMs,
  })

/** The clients of the checks before other commands: few retries, a short connection timeout. */
const PRE_COMMAND_CLIENTS = Object.freeze({
  retry: PRE_COMMAND_RETRY,
  connectionTimeoutMs: PRE_COMMAND_CONNECTION_TIMEOUT_MS,
})

const withoutPeriod = (text) => String(text ?? '').replace(/\.$/, '')

const restoreDenied = ({ region, error }) =>
  new ServerlessError(
    `Your AWS credentials cannot read the Lambda functions of this service in ${region} (${withoutPeriod(error.message)}).\n` +
      '"serverless dev restore" needs lambda:GetFunction and lambda:UpdateFunctionConfiguration on the functions of this service.',
    'DEV_RESTORE_ACCESS_DENIED',
    originalOf(error),
  )

/**
 * The record of the live session in `serviceDir`, or null. A session still starting (its control
 * endpoint not open yet) whose process runs is live too. A session file that cannot be read never
 * stands in the way of the restore.
 */
const liveSessionHere = async ({ serviceDir }) => {
  if (!serviceDir) return null
  const dir = devDirOf(serviceDir)
  let record
  try {
    record = readSession({ dir })
  } catch {
    return null
  }
  return (await isSessionLive({ record, health: healthOf({ dir }) }))
    ? record
    : null
}

/** A `dev restore` result with the exit code the command ends with. */
const withExitCode = (result) => ({ ...result, exit_code: exitCodeOf(result) })

/**
 * `serverless dev restore`: puts every function of the stage that has Dev Mode configuration back
 * on its deployed configuration, whoever attached it. Allowed on any stage; refused while a
 * session of the same stage and region runs in this service directory. Returns the exit code:
 * 0, or 3 when a function could not be restored. The text goes through the logger (stderr); with
 * `--json`, stdout also gets one result: `restore` (the counts, as `dev stop` gives them) and
 * `exit_code`. An error is that result too, then thrown as without `--json`: nothing was changed.
 */
export const runDevRestore = async ({
  serverless,
  provider,
  options = {},
  deps = {},
}) => {
  const { logger = defaultLogger, stdout = process.stdout } = deps
  const json = jsonRequested(options)
  let result
  try {
    result = await restoreStage({ serverless, provider, options, deps })
  } catch (error) {
    if (json) {
      const failed = errorResult(error, { restore: { ...EMPTY_RESTORE } })
      printResult({ json, result: withExitCode(failed), logger, stdout })
    }
    throw error
  }
  return printResult({ json, result: withExitCode(result), logger, stdout })
}

const RESTORE_AGAIN_WHEN = 'to try again the functions that were not restored'

/** The work of `dev restore` and its text: resolves its result, or throws having changed nothing. */
const restoreStage = async ({ serverless, provider, options, deps }) => {
  const {
    logger = defaultLogger,
    progress = defaultProgress,
    now = Date.now,
    sleep,
    sessionHere = liveSessionHere,
  } = deps
  const stage = provider.getStage()
  const region = provider.getRegion()
  // The session running in this directory restores its own functions when it stops; restoring
  // them under it would leave it relaying for functions that no longer reach it.
  const running = await sessionHere({ serviceDir: serverless.serviceDir })
  if (running && running.stage === stage && running.region === region) {
    // A session no command can reach is stopped where it runs, and restored after that.
    const unreachable = running.control_unavailable && !running.control?.url
    throw Object.assign(
      new ServerlessError(
        unreachable
          ? out.sessionUnreachableLine(running)
          : out.restoreRefusedLine(running),
        'DEV_MODE_SESSION_RUNNING',
        { stack: false },
      ),
      {
        next: [
          unreachable
            ? restoreAfterStopNext(running)
            : out.SESSION_RUNNING_NEXT,
        ],
      },
    )
  }
  const keys = serverless.service.getAllFunctions()
  const only = [].concat(options.function ?? [])
  const selection = selectFunctions({ names: keys, only })
  const { lambda } = clientsFor(provider, deps)
  const spinner = progress.get('main')
  spinner.notice(`Looking for Dev Mode configuration on stage "${stage}"`)
  let found
  try {
    found = await findAttachedFunctions({
      lambda,
      names: deployedNames(
        serverless,
        keys.filter((key) => selection.get(key).selected),
      ),
    })
  } catch (error) {
    if (isAccessDenied(error)) throw restoreDenied({ region, error })
    throw error
  } finally {
    spinner.remove()
  }
  if (found.length === 0) {
    const message = out.nothingToRestoreLine({ stage, only })
    logger.notice(message)
    return { status: 'ok', message, restore: { ...EMPTY_RESTORE } }
  }
  logger.aside(out.restoringStageLine({ stage }))
  for (const entry of found) {
    logger.aside(out.restoreCandidateLine(entry, now()))
  }
  logger.blankLine?.()
  const started = now()
  let result
  try {
    spinner.notice(out.restoringProgress({ done: 0, total: found.length }))
    result = await restoreFunctions({
      lambda,
      names: found.map((entry) => entry.name),
      sleep,
      now,
      onProgress: ({ done, total }) =>
        spinner.notice(out.restoringProgress({ done, total })),
    })
  } finally {
    spinner.remove()
  }
  const scope = scopeOf(provider)
  // Lines name functions as deployed; a restore they suggest names them by their keys.
  const keyOf = functionKeyOf(serverless.service)
  for (const [level, text] of out.restoreReportLines({
    result,
    seconds: (now() - started) / 1000,
    keyOf,
    scope,
  })) {
    logger[level](text)
  }
  const restore = restoreCounts(result)
  if (result.failed.length) {
    return {
      status: 'error',
      reason: 'restore_incomplete',
      message: out.notRestoredLine(result.failed),
      // The retry the text suggests: only the functions that failed, so it never widens to
      // functions the command was not asked to restore (a --function selection, or ones restored).
      next: [
        {
          command: out.retryRestoreCommand(result.failed, { keyOf, scope }),
          when: RESTORE_AGAIN_WHEN,
        },
      ],
      restore,
    }
  }
  return {
    status: 'ok',
    message: `${out.restoredLine({ count: out.restoredCount(result) })}.`,
    restore,
  }
}

/** A denied check is skipped with one debug line: deploy-only credentials are normal. */
const skippedLine = (error) =>
  `Skipped the Dev Mode check (needs lambda:GetFunction on the functions of this service): ${error.message}`

/** Why the check before a command could not run, for its warning. */
const checkProblem = (error) =>
  isCredentialError(error)
    ? `: AWS rejected the credentials (${withoutPeriod(error.originalMessage ?? error.message)})`
    : ` (${withoutPeriod(error?.message ?? error)})`

/**
 * A check that could not run is a warning only where Dev Mode ran (`ranHere`): a stage it never
 * ran on has nothing to restore, so its people see the command's output alone, and a debug line.
 */
const reportUnchecked = ({ logger, ranHere, text }) => {
  if (ranHere) logger.warning(text)
  else logger.debug(text)
}

/**
 * Whether `serverless rollback --timestamp` will find the deployment it rolls back to: the same
 * deployment bucket listing and test the rollback itself makes.
 */
export const rollbackTargetExists = async ({
  serverless,
  provider,
  timestamp,
}) => {
  const deploymentPrefix = provider.getDeploymentPrefix()
  const serviceName = serverless.service.service
  const stage = provider.getStage()
  const response = await provider.request('S3', 'listObjectsV2', {
    Bucket: await provider.getServerlessDeploymentBucketName(),
    Prefix: `${deploymentPrefix}/${serviceName}/${stage}`,
  })
  return deploymentExists({
    response,
    deploymentPrefix,
    serviceName,
    stage,
    timestamp,
    naming: provider.naming,
  })
}

/** The stage, region and --aws-profile a command runs with: a restore it suggests names them. */
const scopeOf = (provider) => ({
  stage: provider.getStage(),
  region: provider.getRegion(),
  aws_profile: awsProfileOf(provider.options),
  compose_service: composeServiceOf(provider.serverless),
  config: configOf(provider.serverless, provider.options),
})

/**
 * A rollback restores only when its deployment exists: otherwise the rollback fails on its own
 * and the functions stay as they are. Never throws; returns whether to go on.
 */
const rollbackWillRun = async ({
  serverless,
  provider,
  timestamp,
  logger,
  check,
}) => {
  try {
    if (await check({ serverless, provider, timestamp })) return true
    logger.debug(
      `Skipped the Dev Mode restore: no deployment for timestamp "${timestamp}" (the rollback reports it).`,
    )
  } catch (error) {
    if (isAccessDenied(error) || /ACCESS_DENIED/.test(error?.code ?? '')) {
      logger.debug(
        `Skipped the Dev Mode restore: could not read the deployment bucket (${error.message}).`,
      )
    } else {
      logger.warning(
        `Could not check the deployment to roll back to (${withoutPeriod(error?.message ?? error)}), so Dev Mode configuration was left in place. Run "${restoreCommand(scopeOf(provider))}" after the rollback.`,
      )
    }
  }
  return false
}

/**
 * Runs before `deploy`, `remove` and `rollback` (`verb`: "deploy", "removal", "rollback"):
 * restores every function of the stage that still has Dev Mode configuration, including the
 * functions of a session that may still be running. Never throws, and prints nothing when there
 * is nothing to restore (as on a stage that was never deployed). Reads one function at a time per
 * slot with GetFunction: a function that does not exist yet is not an error. Before a rollback
 * (`timestamp`), it restores only when the deployment to roll back to exists, and looks for it
 * only when there is something to restore. A check that could not run is a warning only when
 * `devModeRanHere` (by default, whether `.serverless/dev/` is in the service directory now), and
 * a debug line otherwise; a throttled one stops at the first function it could not read.
 */
export const restoreStageBeforeCommand = async ({
  serverless,
  provider,
  verb,
  timestamp,
  devModeRanHere = devModeRanIn(serverless.serviceDir),
  deps = {},
}) => {
  const {
    logger = defaultLogger,
    progress = defaultProgress,
    now = Date.now,
    sleep,
    rollbackTargetExists: check = rollbackTargetExists,
  } = deps
  // Its own spinner line, next to the command's (`Packaging`, say).
  const spinner = progress.get('dev-restore')
  try {
    const { lambda } = clientsFor(provider, deps, PRE_COMMAND_CLIENTS)
    const found = await findAttachedFunctions({
      lambda,
      names: deployedNames(serverless, serverless.service.getAllFunctions()),
      stopAtFailure: true,
    })
    if (found.length === 0) return
    if (
      verb === 'rollback' &&
      !(await rollbackWillRun({
        serverless,
        provider,
        timestamp,
        logger,
        check,
      }))
    ) {
      return
    }
    logger.debug(out.runningSessionLine({ verb, count: found.length }))
    spinner.notice(out.restoringBeforeCommandProgress(found.length))
    const started = now()
    let result
    try {
      result = await restoreFunctions({
        lambda,
        names: found.map((entry) => entry.name),
        sleep,
        now,
      })
    } finally {
      spinner.remove()
    }
    // The command keeps its own outcome line: this one is a notice, a failed restore a warning.
    // When something else restored every function in the meantime, nothing was done here: the
    // line is a debug line.
    const count = out.restoredCount(result)
    for (const [level, text] of out.restoreReportLines({
      result,
      seconds: (now() - started) / 1000,
      scope: scopeOf(provider),
      nameOf: functionKeyOf(serverless.service),
      outcome: [
        count ? 'notice' : 'debug',
        out.restoredBeforeCommandLine({ found, count, nowMs: now() }),
      ],
    })) {
      logger[level === 'error' ? 'warning' : level](text)
    }
  } catch (error) {
    spinner.remove()
    if (isAccessDenied(error)) {
      logger.debug(skippedLine(error))
      return
    }
    reportUnchecked({
      logger,
      ranHere: devModeRanHere,
      text: `Could not check this stage for Dev Mode configuration${checkProblem(error)}. If functions still have it, run "${restoreCommand(scopeOf(provider))}".`,
    })
  }
}

/**
 * Runs before `deploy function`, which updates the code and configuration of one function but
 * would leave the Dev Mode layer and wrapper in place: restores that function first. Never throws.
 * A check that could not run is reported as before the other commands (`devModeRanHere`).
 */
export const restoreFunctionBeforeDeployFunction = async ({
  serverless,
  provider,
  functionKey,
  devModeRanHere = devModeRanIn(serverless.serviceDir),
  deps = {},
}) => {
  const { logger = defaultLogger, now = Date.now, sleep } = deps
  try {
    // A function that is not in serverless.yml is reported by `deploy function` itself.
    if (!serverless.service.getAllFunctions().includes(functionKey)) return
    const { lambda } = clientsFor(provider, deps, PRE_COMMAND_CLIENTS)
    const outcome = await restoreFunction({
      lambda,
      name: serverless.service.getFunction(functionKey).name,
      sleep,
      now,
    })
    if (outcome.status === 'restored') {
      logger.notice(`Restored ${functionKey} from Dev Mode`)
      logger.debug(out.runningSessionLine({ verb: 'deploy', count: 1 }))
      for (const line of out.restoreNoteLines([
        { name: functionKey, notes: outcome.notes },
      ])) {
        logger.aside(line)
      }
    } else if (outcome.status === 'failed') {
      logger.warning(
        `Could not restore "${functionKey}" from Dev Mode (${withoutPeriod(outcome.message)}). Run "${restoreCommand(scopeOf(provider), { functionKey })}".`,
      )
    }
  } catch (error) {
    if (isAccessDenied(error)) {
      logger.debug(skippedLine(error))
      return
    }
    reportUnchecked({
      logger,
      ranHere: devModeRanHere,
      text: `Could not check "${functionKey}" for Dev Mode configuration${checkProblem(error)}. If it still has it, run "${restoreCommand(scopeOf(provider), { functionKey })}".`,
    })
  }
}

/**
 * Lifecycle hooks Dev Mode adds, by the exact command being run. The restore-first hooks belong
 * to `deploy`, `remove`, `rollback` and `deploy function` only: the deployment `serverless dev`
 * starts for a stage that was never deployed runs as part of `dev` and gets none.
 *
 * `rollback` restores on `before:rollback:rollback`, only with --timestamp (without it, rollback
 * only lists deployments) and only when that deployment exists. `options` is read when the hook
 * runs, because -t becomes --timestamp only then.
 */
export const devModeCommandHooks = ({
  commandName,
  options = {},
  handlers,
}) => {
  const hooks = {
    'dev:setup:setup': handlers.setup,
    'dev:restore:restore': handlers.restore,
  }
  // The finite commands next to a session; each handler sets the exit code from its result.
  for (const name of ['status', 'stop', 'wait', 'requests', 'replay']) {
    if (handlers[name]) hooks[`dev:${name}:${name}`] = handlers[name]
  }
  if (commandName === 'deploy') {
    hooks['before:deploy:deploy'] = handlers.restoreStage('deploy')
  }
  if (commandName === 'remove') {
    hooks['before:remove:remove'] = handlers.restoreStage('removal')
  }
  if (commandName === 'rollback') {
    const restore = handlers.restoreStage('rollback')
    hooks['before:rollback:rollback'] = async () => {
      if (options.timestamp) return restore()
      return undefined
    }
  }
  if (commandName === 'deploy function') {
    hooks['before:deploy:function:initialize'] = handlers.restoreFunction
  }
  return hooks
}
