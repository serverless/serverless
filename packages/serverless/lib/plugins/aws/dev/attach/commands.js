/**
 * The finite Dev Mode commands and the hooks other commands run: `serverless dev setup`,
 * `serverless dev restore`, and the restore that `deploy`, `remove`, `rollback` and
 * `deploy function` run first. Those four never fail because of it: a denied check is a debug
 * line, any other problem a warning where a session ran (a debug line elsewhere). Web apps are
 * restored before `deploy` and `rollback` too, found from AWS alone; `remove` deletes their web
 * functions, and Dev Mode's revisions and endpoints with them, and `deploy function` never deploys
 * a web app.
 */
import pLimit from 'p-limit'
import {
  log,
  progress as defaultProgress,
  ServerlessError,
} from '@serverless/util'
import {
  BROKER_POLICY_NAME,
  brokerRoleArn,
  brokerRoleName,
  brokerRolePattern,
  functionKeyOf,
} from './naming.js'
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
  CONTROL_PLANE_PARALLELISM,
  findAttachedFunctions,
  restoreFunction,
  restoreFunctions,
} from './attach.js'
import { selectFunctions } from './eligibility.js'
import { findAttachedWebApps, restoreWebApp } from '../web/attach.js'
import { selectWebApps } from '../web/eligibility.js'
import { webAppsOf } from './session-web.js'
import { deploymentExists } from '../../utils/deployment-exists.js'
import * as out from './output.js'
import {
  createBroker,
  getBroker,
  identityFrom,
  brokerPolicyIsNewer,
  putBrokerBoundary,
  putBrokerPolicy,
  widenBrokerTrust,
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
  'DEV_MODE_BROKER_UPDATE_DENIED',
])

/**
 * `arn`: the role's ARN once setup knows where the role is or would be created; before (iam:GetRole
 * denied), the role is named with the pattern that covers it under any IAM path.
 */
const setupDenied = ({ region, name, arn, identity, error }) =>
  new ServerlessError(
    `Your AWS credentials cannot set up Dev Mode in ${region} (${error.originalMessage ?? error.message}).\n` +
      `"serverless dev setup" needs iam:GetRole, iam:GetRolePolicy, iam:CreateRole, iam:PutRolePolicy and iam:UpdateAssumeRolePolicy on the IAM role ${arn ?? `"${name}" under any IAM path (${brokerRolePattern(identity)})`}, plus iam:PutRolePermissionsBoundary when --permissions-boundary is given.\n` +
      'Run it again with the credentials of an AWS administrator.',
    'DEV_SETUP_ACCESS_DENIED',
    {
      ...originalOf(error),
      originalMessage: error.originalMessage ?? error.message,
    },
  )

/**
 * Creates the broker role, or brings an existing one up to date. `found.arn` is set to the role's
 * ARN once it is known: the existing role's, else the one it is created with.
 */
const ensureBroker = async ({
  iam,
  name,
  identity,
  region,
  path,
  boundary,
  explicitPath,
  found,
}) => {
  let existing = await getBroker({
    iam,
    name,
    identity,
    region,
    retryCommand: cliCommand('dev setup'),
  })
  found.arn = existing?.arn ?? brokerRoleArn({ identity, name, path })
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
    if (existing) found.arn = existing.arn
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
    : await brokerPolicyIsNewer({
        iam,
        name,
        arn: existing.arn,
        identity,
        region,
      })
  if (boundary) await putBrokerBoundary({ iam, name, boundary })
  // A role an earlier release created trusts functions only: web apps need it widened.
  const widen = !existing.widened
  if (widen) {
    await widenBrokerTrust({
      iam,
      name,
      identity,
      region,
      externalId: existing.externalId,
    })
  }
  if (!policyPut && !keep) {
    await putBrokerPolicy({ iam, name, arn: existing.arn, identity, region })
  }
  const written = !keep
  const policy = written
    ? `re-applied its permission policy ${BROKER_POLICY_NAME}`
    : `kept its permission policy ${BROKER_POLICY_NAME}, which a newer version of Dev Mode wrote`
  const boundarySet = boundary
    ? `${written ? '' : ','} and set the permissions boundary ${boundary}`
    : ''
  const trust = widen ? 'updated its trust policy for web apps, ' : ''
  return `IAM role ${existing.arn} (already existed; ${trust}${policy}${boundarySet})`
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
  let identity
  // The role's ARN, once setup knows where the role is or would be created.
  const found = { arn: null }
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
    identity = identityFrom({
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
      found,
    })
  } catch (error) {
    if (DENIED_CODES.has(error?.code) || isAccessDenied(error)) {
      throw setupDenied({ region, name, arn: found.arn, identity, error })
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

const NOTHING_RESTORED = Object.freeze({
  restored: [],
  unchanged: [],
  skipped: [],
  missing: [],
  failed: [],
})
/**
 * Waits for every promise in `promises` to settle, so no AWS call is left running when the command
 * goes on. `values` has each one's value, `fallback` for one that failed; `failed[i]` says whether
 * it did; `error` is the one to report: rejected credentials first, else the first failure.
 */
const settleAll = async (promises, fallback) => {
  const settled = await Promise.allSettled(promises)
  const errors = settled
    .filter(({ status }) => status === 'rejected')
    .map(({ reason }) => reason)
  return {
    values: settled.map(({ status, value }) =>
      status === 'fulfilled' ? value : fallback,
    ),
    failed: settled.map(({ status }) => status === 'rejected'),
    error: errors.find(isCredentialError) ?? errors[0],
  }
}
/** Two restore results (`restoreFunctions`' shape) as one: the functions' entries first. */
const mergeResults = (functions, webApps) =>
  Object.fromEntries(
    Object.keys(NOTHING_RESTORED).map((key) => [
      key,
      [...(functions[key] ?? []), ...(webApps[key] ?? [])],
    ]),
  )
/**
 * Restores the web apps in `found` (entries of `findAttachedWebApps`), whichever session left
 * them, at most CONTROL_PLANE_PARALLELISM at a time. The result has the shape of
 * `restoreFunctions`' result, each entry `{ name: key, webApp: true, message? }`. Expired
 * credentials stop it.
 */
const restoreWebApps = async ({
  lambdaWeb,
  found,
  sleep,
  now,
  onProgress = () => {},
}) => {
  const limit = pLimit(CONTROL_PLANE_PARALLELISM)
  let done = 0
  const outcomes = await Promise.all(
    found.map(({ key, functionName }) =>
      limit(async () => {
        const outcome = await restoreWebApp({
          lambdaWeb,
          functionName,
          sleep,
          now,
        })
        done += 1
        onProgress({ done, total: found.length })
        return { key, ...outcome }
      }),
    ),
  )
  const result = mergeResults(NOTHING_RESTORED, {})
  for (const { key, state, message } of outcomes) {
    result[state].push({ name: key, webApp: true, ...(message && { message }) })
  }
  return result
}

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
const webRestoreDenied = ({ region, error }) =>
  new ServerlessError(
    `Your AWS credentials cannot read the web apps of this service in ${region} (${withoutPeriod(error.message)}).\n` +
      '"serverless dev restore" needs lambda:ListWebFunctionEndpoints, lambda:GetWebFunctionEndpoint, lambda:GetWebFunctionRevision, lambda:UpdateWebFunctionEndpoint, lambda:DeleteWebFunctionEndpoint, lambda:ListWebFunctionRevisions and lambda:DeleteWebFunctionRevision on the web functions of this service.',
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
 * on its deployed configuration, and every web app whose endpoints Dev Mode changed back on its
 * deployed revision (deleting Dev Mode's endpoints and revisions), whoever attached it. --function
 * limits it to those functions, --web-app to those web apps. Allowed on any stage; refused while a
 * session of the same stage and region runs in this service directory. Returns the exit code:
 * 0, or 3 when a function or web app could not be restored. The text goes through the logger
 * (stderr); with `--json`, stdout also gets one result: `restore` (the counts, as `dev stop` gives
 * them; web apps counted with the functions), for a service with web apps `web_apps` (the same
 * counts for its web apps alone), and `exit_code`. An error is that result too, then
 * thrown as without `--json`: nothing was changed.
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

/**
 * Why the retry a failed restore suggests runs, naming what failed: functions, web apps or both.
 */
const restoreAgainWhen = (failed) => {
  const webApps = failed.some((entry) => entry.webApp)
  const functions = failed.some((entry) => !entry.webApp)
  let what = 'functions'
  if (webApps) what = functions ? 'functions and web apps' : 'web apps'
  return `to try again the ${what} that were not restored`
}

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
          : out.restoreRefusedLine(running, {
              functions: serverless.service.getAllFunctions().length > 0,
              webApps: webAppsOf(serverless, provider).length > 0,
            }),
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
  const onlyWebApps = [].concat(options['web-app'] ?? [])
  const selection = selectFunctions({ names: keys, only })
  const webApps = webAppsOf(serverless, provider)
  const webSelection = selectWebApps({
    names: webApps.map(({ key }) => key),
    only: onlyWebApps,
  })
  // --function limits the restore to those functions, --web-app to those web apps; neither: all.
  const everything = only.length === 0 && onlyWebApps.length === 0
  const functionKeys =
    everything || only.length
      ? keys.filter((key) => selection.get(key).selected)
      : []
  const wantedWebApps =
    everything || onlyWebApps.length
      ? webApps.filter(({ key }) => webSelection.get(key).selected)
      : []
  const { lambda, lambdaWeb } = clientsFor(provider, deps)
  const spinner = progress.get('main')
  spinner.notice(`Looking for Dev Mode configuration on stage "${stage}"`)
  let found
  let webFound
  try {
    const lookups = await settleAll(
      [
        findAttachedFunctions({
          lambda,
          names: deployedNames(serverless, functionKeys),
        }).catch((error) => {
          throw isAccessDenied(error) ? restoreDenied({ region, error }) : error
        }),
        wantedWebApps.length
          ? findAttachedWebApps({ lambdaWeb, webApps: wantedWebApps }).catch(
              (error) => {
                throw isAccessDenied(error)
                  ? webRestoreDenied({ region, error })
                  : error
              },
            )
          : [],
      ],
      [],
    )
    if (lookups.error) throw lookups.error
    ;[found, webFound] = lookups.values
  } finally {
    spinner.remove()
  }
  const total = found.length + webFound.length
  if (total === 0) {
    const message = out.nothingToRestoreLine({
      stage,
      only,
      onlyWebApps,
      hasWebApps: webApps.length > 0,
    })
    logger.notice(message)
    return {
      status: 'ok',
      message,
      restore: { ...EMPTY_RESTORE },
      ...(webApps.length && { web_apps: { ...EMPTY_RESTORE } }),
    }
  }
  logger.aside(
    out.restoringStageLine({
      stage,
      functions: found.length > 0,
      webApps: webFound.length > 0,
    }),
  )
  for (const entry of found) {
    logger.aside(out.restoreCandidateLine(entry, now()))
  }
  for (const entry of webFound) logger.aside(out.webAppCandidateLine(entry))
  logger.blankLine?.()
  const started = now()
  let result
  const done = { functions: 0, webApps: 0 }
  const showProgress = () =>
    spinner.notice(
      out.restoringProgress({
        done: done.functions + done.webApps,
        total,
        webApps: webFound.length,
      }),
    )
  try {
    showProgress()
    const restores = await settleAll(
      [
        found.length
          ? restoreFunctions({
              lambda,
              names: found.map((entry) => entry.name),
              sleep,
              now,
              onProgress: (progressed) => {
                done.functions = progressed.done
                showProgress()
              },
            })
          : NOTHING_RESTORED,
        webFound.length
          ? restoreWebApps({
              lambdaWeb,
              found: webFound,
              sleep,
              now,
              onProgress: (progressed) => {
                done.webApps = progressed.done
                showProgress()
              },
            })
          : NOTHING_RESTORED,
      ],
      NOTHING_RESTORED,
    )
    // Both restores have settled: a failure (expired credentials) ends the command as before.
    if (restores.error) throw restores.error
    result = mergeResults(...restores.values)
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
  // A service with web apps: their own counts too (`restore` counts them with the functions).
  const webCounts = webApps.length && {
    web_apps: restoreCounts(
      Object.fromEntries(
        Object.entries(result).map(([key, entries]) => [
          key,
          Array.isArray(entries)
            ? entries.filter((entry) => entry.webApp)
            : entries,
        ]),
      ),
    ),
  }
  if (result.failed.length) {
    return {
      status: 'error',
      reason: 'restore_incomplete',
      message: out.notRestoredLine(result.failed),
      // The retry the text suggests: only what failed, so it never widens to functions or web
      // apps the command was not asked to restore (a selection, or ones restored).
      next: [
        {
          command: out.retryRestoreCommand(result.failed, { keyOf, scope }),
          when: restoreAgainWhen(result.failed),
        },
      ],
      restore,
      ...webCounts,
    }
  }
  return {
    status: 'ok',
    message: `${out.restoredLine({
      count: out.restoredCount(result),
      webApps: result.restored.filter((entry) => entry.webApp).length,
    })}.`,
    restore,
    ...webCounts,
  }
}

/**
 * A check denied lambda:GetFunction is skipped. Deploy-only credentials are normal, so the line is
 * a warning only where Dev Mode ran (see reportUnchecked). `functionKey`: the one function
 * `deploy function` checks; else the stage before `verb` ("deploy", "removal", "rollback").
 * `cause`, AWS's own message, goes in the debug line only.
 */
const skippedLine = ({ verb, scope, functionKey, cause }) => {
  const skipped = `Dev Mode check skipped: it needs lambda:GetFunction${cause ? ` (${withoutPeriod(cause)})` : ''}.`
  if (functionKey) {
    return `${skipped} If a Dev Mode session attached ${functionKey}, it stays attached after this deployment; run "${restoreCommand(scope, { functionKey })}" to detach it.`
  }
  const attached = 'If a Dev Mode session attached functions of this stage,'
  // A removal deletes the functions, so there is nothing left to restore after it.
  if (verb === 'removal') {
    return `${skipped} ${attached} this removal deletes them without detaching them first.`
  }
  return `${skipped} ${attached} they stay attached after this ${verb === 'deploy' ? 'deployment' : verb}; run "${restoreCommand(scope)}" to detach them.`
}

/** Why the check before a command could not run, for its warning. */
const checkProblem = (error) =>
  isCredentialError(error)
    ? `: AWS rejected the credentials (${withoutPeriod(error.originalMessage ?? error.message)})`
    : ` (${withoutPeriod(error?.message ?? error)})`

/**
 * A check that could not run is a warning only where Dev Mode ran (`ranHere`): a stage it never
 * ran on has nothing to restore, so its people see the command's output alone, and a debug line
 * (`debugText` when the debug line says more).
 */
const reportUnchecked = ({ logger, ranHere, text, debugText = text }) => {
  if (ranHere) logger.warning(text)
  else logger.debug(debugText)
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
 * A check of the web apps denied the Lambda Web reads is skipped, as a function check denied
 * lambda:GetFunction is (see skippedLine). `cause` goes in the debug line only.
 */
const webSkippedLine = ({ verb, scope, cause }) =>
  `Dev Mode check of web apps skipped: it needs lambda:ListWebFunctionEndpoints and lambda:GetWebFunctionRevision${cause ? ` (${withoutPeriod(cause)})` : ''}. If a Dev Mode session attached web apps of this stage, they stay attached after this ${verb === 'deploy' ? 'deployment' : verb}; run "${restoreCommand(scope)}" to detach them.`

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
 *
 * Before `deploy` and `rollback`, the service's web apps are checked and restored the same way,
 * from AWS alone (a deploy from CI or another machine has no `.serverless/dev/`): one endpoint
 * listing per web app, none for a service without web apps, and a web function that does not
 * exist yet has nothing to restore. The web apps and the functions are checked side by side; a
 * check of one that could not run never stops the restore of the other. Before `remove`, web apps
 * are not read: deleting a web function deletes Dev Mode's revisions and endpoints with it.
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
  const functionsUnchecked = (error) => {
    if (isAccessDenied(error)) {
      const skipped = { verb, scope: scopeOf(provider) }
      reportUnchecked({
        logger,
        ranHere: devModeRanHere,
        text: skippedLine(skipped),
        debugText: skippedLine({ ...skipped, cause: error.message }),
      })
      return
    }
    reportUnchecked({
      logger,
      ranHere: devModeRanHere,
      text: `Could not check this stage for Dev Mode configuration${checkProblem(error)}. If functions still have it, run "${restoreCommand(scopeOf(provider))}".`,
    })
  }
  const webAppsUnchecked = (error) => {
    if (isAccessDenied(error)) {
      const skipped = { verb, scope: scopeOf(provider) }
      reportUnchecked({
        logger,
        ranHere: devModeRanHere,
        text: webSkippedLine(skipped),
        debugText: webSkippedLine({ ...skipped, cause: error.message }),
      })
      return
    }
    reportUnchecked({
      logger,
      ranHere: devModeRanHere,
      text: `Could not check the web apps of this stage for Dev Mode configuration${checkProblem(error)}. If web apps still have it, run "${restoreCommand(scopeOf(provider))}".`,
    })
  }
  // Both the functions and the web apps were being restored.
  const stageUnchecked = (error) =>
    reportUnchecked({
      logger,
      ranHere: devModeRanHere,
      text: `Could not check this stage for Dev Mode configuration${checkProblem(error)}. If functions or web apps still have it, run "${restoreCommand(scopeOf(provider))}".`,
    })
  try {
    const { lambda, lambdaWeb } = clientsFor(
      provider,
      deps,
      PRE_COMMAND_CLIENTS,
    )
    const webApps = verb === 'removal' ? [] : webAppsOf(serverless, provider)
    const [functionsLookup, webAppsLookup] = await Promise.allSettled([
      findAttachedFunctions({
        lambda,
        names: deployedNames(serverless, serverless.service.getAllFunctions()),
        stopAtFailure: true,
      }),
      webApps.length ? findAttachedWebApps({ lambdaWeb, webApps }) : [],
    ])
    if (functionsLookup.status === 'rejected') {
      functionsUnchecked(functionsLookup.reason)
    }
    if (webAppsLookup.status === 'rejected') {
      webAppsUnchecked(webAppsLookup.reason)
    }
    const found = functionsLookup.value ?? []
    const webFound = webAppsLookup.value ?? []
    if (found.length === 0 && webFound.length === 0) return
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
    logger.debug(
      out.runningSessionLine({
        verb,
        count: found.length,
        webApps: webFound.length,
      }),
    )
    spinner.notice(
      out.restoringBeforeCommandProgress(found.length, webFound.length),
    )
    const started = now()
    let restores
    try {
      // Both settle before the command goes on: neither is left running while it deploys.
      restores = await settleAll(
        [
          found.length
            ? restoreFunctions({
                lambda,
                names: found.map((entry) => entry.name),
                sleep,
                now,
              })
            : NOTHING_RESTORED,
          webFound.length
            ? restoreWebApps({ lambdaWeb, found: webFound, sleep, now })
            : NOTHING_RESTORED,
        ],
        NOTHING_RESTORED,
      )
    } finally {
      spinner.remove()
    }
    // A restore that failed (expired credentials) is reported once, after what the other did.
    const report = () => {
      if (!restores.error) return
      if (webFound.length === 0) functionsUnchecked(restores.error)
      else if (found.length === 0) webAppsUnchecked(restores.error)
      else stageUnchecked(restores.error)
    }
    const [functionsFailed, webAppsFailed] = restores.failed
    if (
      !(found.length && !functionsFailed) &&
      !(webFound.length && !webAppsFailed)
    ) {
      report()
      return
    }
    const result = mergeResults(...restores.values)
    // The command keeps its own outcome line: this one is a notice, a failed restore a warning.
    // When something else restored everything in the meantime, nothing was done here: the line
    // is a debug line.
    const count = out.restoredCount(result)
    const restoredWebApps = webFound.filter(({ key }) =>
      result.restored.some((entry) => entry.webApp && entry.name === key),
    )
    for (const [level, text] of out.restoreReportLines({
      result,
      seconds: (now() - started) / 1000,
      scope: scopeOf(provider),
      nameOf: functionKeyOf(serverless.service),
      outcome: [
        count ? 'notice' : 'debug',
        out.restoredBeforeCommandLine({
          found,
          count: count - restoredWebApps.length,
          nowMs: now(),
          webApps: restoredWebApps,
        }),
      ],
    })) {
      logger[level === 'error' ? 'warning' : level](text)
    }
    report()
  } catch (error) {
    spinner.remove()
    functionsUnchecked(error)
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
      const skipped = { scope: scopeOf(provider), functionKey }
      reportUnchecked({
        logger,
        ranHere: devModeRanHere,
        text: skippedLine(skipped),
        debugText: skippedLine({ ...skipped, cause: error.message }),
      })
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
