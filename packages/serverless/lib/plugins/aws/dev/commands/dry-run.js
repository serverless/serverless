/**
 * `serverless dev --dry-run`: the checks a session runs before it changes anything, and the
 * changes it would make, with nothing changed. Only read calls reach AWS (and one HTTPS connection
 * to the AWS IoT Core endpoint); no Direct Messaging is sent, so a function another session holds
 * is judged by its owner alone; nothing is written under .serverless/dev.
 */
import nodeFs from 'fs'
import https from 'https'
// Subpath import: tests that load every plugin mock '@serverless/util' wholesale.
import { getProxyAgent } from '@serverless/util/src/proxy/index.js'
import { style } from '@serverless/util/src/logger/index.js'
import {
  awsErrorOf,
  createDevModeClients,
  credentialsInvalidError,
  findIotEndpoint,
  isAccessDenied,
  isCredentialError,
  providerCallError,
} from '../attach/aws.js'
import { credentialSourceOf } from '../relay/messages.js'
import { brokerPolicyState, getBroker, identityFrom } from '../attach/broker.js'
import {
  classifyByConfig,
  classifyFunction,
  configuredArtifactOf,
  resolvedTimeoutSeconds,
  selectFunctions,
  unattachedDevModeLayers,
} from '../attach/eligibility.js'
import {
  findLayerVersion,
  publishedByDevMode,
  readLayerArtifact,
} from '../attach/layer.js'
import {
  brokerRoleName,
  isProtectedStage,
  layerName,
} from '../attach/naming.js'
import * as out from '../attach/output.js'
import { detectRuntimes, readLiveFunctions } from '../attach/session-attach.js'
import {
  createLayerLambda,
  stackExistsWith,
} from '../attach/session-preflight.js'
import { GLOBAL_TIMERS, defaultOwner } from '../attach/session-support.js'
import { buildAttachVariables } from '../attach/undo-record.js'
import { healthOf } from '../control/client.js'
import { detectLocalRuntimes } from '../local/adapters/index.js'
import { processAlive } from '../local/leftovers.js'
import { mcpServersOf } from '../local/mcp.js'
import { devDirOf } from '../state/paths.js'
import { isSessionLive, readSession } from '../state/session-file.js'
import { sameScope, selectionOf } from '../state/session-state.js'
import { envelope, errorResult, isActionRequired } from './envelope.js'
import { cliCommand } from './cli-names.js'

export const IOT_CONNECT_TIMEOUT_MS = 5_000
// No session has this id: every attachment found belongs to another session.
const DRY_RUN_SESSION = `s_${'0'.repeat(12)}`

/** What the broker_role check adds about the broker's permission policy, by its state. */
const BROKER_POLICY_NOTES = {
  missing:
    '; its permission policy is missing and is put back when a session starts',
  outdated:
    '; its permission policy differs from the one this version of Dev Mode writes and is updated when a session starts',
  newer:
    '; its permission policy was written by a newer version of Dev Mode and is left as it is',
}
/** What an attach changes on a function, as machine codes (the human text says it in words). */
export const CHANGE_FIELDS = Object.freeze([
  'layers',
  'environment',
  'exec_wrapper',
])

export const CHECK_LABELS = Object.freeze({
  stage: 'Stage',
  signin: 'Serverless sign-in',
  session: 'Session here',
  aws_identity: 'AWS identity',
  iot_endpoint: 'AWS IoT Core',
  iot_connect: 'Connection to AWS IoT Core',
  broker_role: 'IAM role',
  stack: 'Stack',
  functions: 'Functions',
  layers: 'Lambda layers',
})

// The principal of an ARN without the account: "assumed-role/Developer/alice".
const principalOf = (arn) =>
  String(arn ?? '')
    .split(':')
    .slice(5)
    .join(':')

/**
 * Whether this machine reaches the AWS IoT Core endpoint over HTTPS: one GET of /mqtt, through the
 * proxy the relay would use. Any HTTP answer means yes (it needs no signature to answer). The
 * answer comes within `timeoutMs` whatever the network does: the request's idle timeout starts
 * only once it has a socket, which a proxy that never answers CONNECT never gives it, so a timer
 * bounds the whole check. With its answer the check ends the request and the connection to the
 * proxy, so nothing it opened keeps the process running.
 */
export const checkIotConnect = ({
  host,
  env = process.env,
  timeoutMs = IOT_CONNECT_TIMEOUT_MS,
  request = https.request,
  agentFor = (url, agentOptions) => getProxyAgent(url, { env, agentOptions }),
  timers = GLOBAL_TIMERS,
}) =>
  new Promise((resolve) => {
    const limit = `no answer within ${timeoutMs / 1000}s`
    // Ends the request and, through the proxy agent, its connection to the proxy.
    const abort = new AbortController()
    let req = null
    let timer = null
    let settled = false
    const done = (result) => {
      if (settled) return
      settled = true
      timers.clearTimeout(timer)
      resolve(result)
      abort.abort()
      req?.destroy()
    }
    timer = timers.setTimeout(
      () => done({ ok: false, message: limit }),
      timeoutMs,
    )
    try {
      req = request(
        {
          host,
          port: 443,
          servername: host,
          method: 'GET',
          path: '/mqtt',
          agent:
            agentFor(`wss://${host}/mqtt`, { signal: abort.signal }) ||
            undefined,
          timeout: timeoutMs,
          signal: abort.signal,
        },
        (res) => {
          // Ending the request at once may cut the body short: not an error here.
          res.on('error', () => {})
          res.resume()
          done({ ok: true, status: res.statusCode })
        },
      )
    } catch (error) {
      done({ ok: false, message: error.message })
      return
    }
    req.on('timeout', () => req.destroy(new Error(limit)))
    req.on('error', (error) =>
      done({ ok: false, message: error?.message ?? limit }),
    )
    req.end()
  })

/**
 * The session running in `serviceDir`, as `{ record }`, or null: the session file read once, and
 * live as `isSessionLive` decides (its process runs, never this process, and once it names a
 * control endpoint, that endpoint answers with its id; a session still starting names none yet).
 * Reads only.
 */
export const findRunningSession = async ({
  serviceDir,
  fs = nodeFs,
  isAlive = processAlive,
  health,
  timers = GLOBAL_TIMERS,
}) => {
  if (!serviceDir) return null
  const dir = devDirOf(serviceDir)
  let record
  try {
    record = readSession({ dir, fs })
  } catch {
    return null
  }
  const live = await isSessionLive({
    record,
    isAlive,
    health: health ?? healthOf({ dir, fs, timers }),
    timers,
  })
  return live ? { record } : null
}

/**
 * A check's failure as reason and message. Rejected credentials and denials are recognised on the
 * AWS error (`provider.request` wraps it; `awsErrorOf` unwraps it); a denial names `permission`
 * (`{ action, why }`) in the session's own words. Anything else takes the reason its CLI error
 * code maps to.
 */
const failureOf = (error, { region, credentialSource }, permission) => {
  const aws = awsErrorOf(error)
  if (isCredentialError(aws)) {
    return {
      reason: 'credentials_expired',
      message: credentialsInvalidError(aws, region, credentialSource).message,
    }
  }
  if (isAccessDenied(aws)) {
    return {
      reason: 'permission_denied',
      message: permission
        ? providerCallError(error, { region, credentialSource, ...permission })
            .message
        : error.message,
    }
  }
  const { reason, message } = errorResult(error)
  return { reason, message }
}

/**
 * Runs every check a session runs before it changes anything, and builds the plan it would show,
 * reading only. Resolves `{ service, stage, region, plan, rows, preflight }`: `plan` is null when
 * a check before the stack failed, `rows` the function table, `preflight` one entry per check
 * made. `deps` replaces the AWS clients, the stack check, the layer artifacts, the interpreter
 * detection, the DNS lookup, the connection check, the session lookup, the owner, the environment,
 * the filesystem and the clock.
 */
export const planSession = async ({
  serverless,
  provider,
  options = {},
  deps = {},
}) => {
  const stage = provider.getStage()
  const region = provider.getRegion()
  // Where the checks run, and where the credentials their advice names come from.
  const scope = { region, credentialSource: credentialSourceOf(provider) }
  const service = serverless.service
  const keys = service.getAllFunctions()
  const preflight = []
  const planned = {
    service: service.service,
    stage,
    region,
    plan: null,
    rows: [],
    preflight,
  }
  const pass = (check, fields = {}) =>
    preflight.push({ check, ok: true, ...fields })
  // A person must act only on the reasons every result marks so.
  const fail = (check, fields) =>
    preflight.push({
      check,
      ok: false,
      ...fields,
      ...(isActionRequired(fields.reason) && { user_action_required: true }),
    })

  if (isProtectedStage(stage)) {
    fail('stage', {
      reason: 'stage_protected',
      message: out.protectedStageMessage(stage),
    })
    return planned
  }
  pass('stage', { message: `stage "${stage}" can use Dev Mode` })
  // This code runs only after the CLI signed in to Serverless Framework.
  pass('signin', { message: 'signed in to Serverless Framework' })

  const {
    clients = createDevModeClients({ provider, region }),
    // The session also reads the stack's outputs (its endpoints); the dry run needs none.
    stackExists = stackExistsWith(provider),
    readArtifact = readLayerArtifact,
    detectLocal = detectLocalRuntimes,
    lookup,
    connectIot = checkIotConnect,
    connect = findRunningSession,
    owner = defaultOwner(),
    env = process.env,
    fs = nodeFs,
    now = Date.now,
  } = deps
  const selection = selectFunctions({
    names: keys,
    only: [].concat(options.function ?? []),
    skip: [].concat(options['skip-function'] ?? []),
  })

  const running = await Promise.resolve()
    .then(() => connect({ serviceDir: serverless.serviceDir, fs }))
    .catch(() => null)
  if (!running) {
    pass('session', { message: 'no Dev Mode session is running here' })
  } else {
    const { record } = running
    if (sameScope(record, { stage, region, selection: selectionOf(options) })) {
      pass('session', {
        reason: 'already_running',
        message: out.sessionHereLine(record),
      })
    } else {
      fail('session', {
        reason: 'session_running',
        message: out.sessionRunningLine(record),
      })
    }
  }

  let account
  try {
    account = await provider.getAccountInfo()
  } catch (error) {
    fail(
      'aws_identity',
      failureOf(error, scope, {
        action: 'sts:GetCallerIdentity',
        why: 'to read who is running the session',
      }),
    )
    return planned
  }
  let identity
  try {
    identity = identityFrom({
      accountId: account.accountId,
      callerArn: account.arn,
    })
  } catch (error) {
    fail('aws_identity', failureOf(error, scope))
    return planned
  }
  pass('aws_identity', { message: principalOf(account.arn) })

  let iotEndpoint = null
  try {
    iotEndpoint = await findIotEndpoint({ iot: clients.iot, region, lookup })
    pass('iot_endpoint', {
      host: iotEndpoint,
      message: `AWS IoT Core in ${region}`,
    })
  } catch (error) {
    fail('iot_endpoint', failureOf(error, scope))
  }
  if (iotEndpoint) {
    const reach = await connectIot({ host: iotEndpoint, env })
    if (reach.ok) {
      pass('iot_connect', {
        host: iotEndpoint,
        message: `HTTPS connection to ${iotEndpoint}:443`,
      })
    } else {
      fail('iot_connect', {
        reason: 'network_blocked',
        host: iotEndpoint,
        message: `Dev Mode could not connect to AWS IoT Core at ${iotEndpoint}:443 (${reach.message}). Allow outbound HTTPS to that host, or set HTTPS_PROXY, then run the command again.`,
      })
    }
  }

  const brokerName = brokerRoleName(region)
  let broker = null
  let brokerKnown = false
  let brokerPolicy = 'present'
  try {
    broker = await getBroker({
      iam: clients.iam,
      name: brokerName,
      identity,
      region,
    })
    if (broker) {
      brokerPolicy = await brokerPolicyState({
        iam: clients.iam,
        name: brokerName,
        identity,
        region,
      })
    }
    brokerKnown = true
    if (broker) {
      pass('broker_role', {
        message: `IAM role ${brokerName} exists${BROKER_POLICY_NOTES[brokerPolicy] ?? ''}`,
      })
    } else {
      pass('broker_role', {
        reason: 'broker_missing',
        message: `IAM role ${brokerName} does not exist yet: the first session creates it (iam:CreateRole), or an administrator runs "serverless dev setup --region ${region}".`,
      })
    }
  } catch (error) {
    fail('broker_role', failureOf(error, scope))
  }

  let deployFirst
  try {
    deployFirst = !(await stackExists())
  } catch (error) {
    fail(
      'stack',
      failureOf(error, scope, {
        action: 'cloudformation:DescribeStacks',
        why: `in ${region} to check whether stage "${stage}" is deployed`,
      }),
    )
    return planned
  }
  pass('stack', {
    message: deployFirst
      ? `stage "${stage}" is not deployed yet: "${cliCommand('dev')}" deploys it first`
      : `stage "${stage}" is deployed`,
  })

  const resolvedRuntime = (key) => {
    const config = service.getFunction(key)
    return config.image ? undefined : provider.getRuntime(config.runtime)
  }
  const mcpFunctions = mcpServersOf(serverless)
  // The artifact serverless.yml deploys a function from, as the session reads it.
  const artifactOf = (key) =>
    configuredArtifactOf({
      config: service.getFunction(key),
      servicePackage: service.package,
    })
  let rows
  if (deployFirst) {
    const localRuntimes = await detectLocal({
      runtimes: keys.map(resolvedRuntime),
      serviceDir: serverless.serviceDir,
    })
    rows = keys.map((key) => {
      const config = service.getFunction(key)
      return (
        classifyByConfig({
          name: key,
          config,
          runtime: resolvedRuntime(key),
          // The timeout the first deployment gives it, exactly as the session passes it.
          timeout: resolvedTimeoutSeconds(config, service.provider),
          selection: selection.get(key),
          localRuntimes,
          mcp: mcpFunctions.has(key),
          artifact: artifactOf(key),
          serviceDir: serverless.serviceDir,
        }) ?? {
          function: key,
          mode: 'dev',
          why: 'attached after the first deployment',
          notes: [],
        }
      )
    })
  } else {
    let lives
    try {
      lives = await readLiveFunctions({
        keys,
        selection,
        clients,
        deployedName: (key) => service.getFunction(key).name,
      })
    } catch (error) {
      fail(
        'functions',
        failureOf(error, scope, {
          action: 'lambda:GetFunction',
          why: `in ${region} to read the configuration of each function`,
        }),
      )
      return planned
    }
    const localRuntimes = await detectRuntimes({
      lives,
      localRuntimes: null,
      detectLocal,
      serviceDir: serverless.serviceDir,
    })
    // Values of the real lengths, so the environment budget is checked as a session would check
    // it. Nothing here is written anywhere.
    const session = {
      id: DRY_RUN_SESSION,
      owner,
      attachedAt: Math.floor(now() / 1000),
      broker: broker ?? {
        arn: `arn:${identity.partition}:iam::${identity.accountId}:role/${brokerName}`,
        externalId: '0'.repeat(32),
      },
      key: Buffer.alloc(32).toString('base64'),
      iotEndpoint: iotEndpoint ?? '',
    }
    // Dev Mode layers left without their wrapper are replaced by a session, as they are here.
    const devModeLayerVersions = await publishedByDevMode({
      lambda: createLayerLambda({ clients, region }),
      layerArns: unattachedDevModeLayers(lives.values()),
    })
    // The live Timeout decides `timeout_too_short` here, as it does in the session.
    rows = keys.map((key) =>
      classifyFunction({
        name: key,
        config: service.getFunction(key),
        live: lives.get(key),
        context: {
          selection: selection.get(key),
          sessionId: DRY_RUN_SESSION,
          owner,
          takeOver: Boolean(options['take-over']),
          attachVariables: (variables, otherLayerArns) =>
            buildAttachVariables({ live: variables, otherLayerArns, session }),
          localRuntimes,
          // No Direct Messaging in a dry run: an attachment is judged by its owner alone.
          liveness: undefined,
          mcp: mcpFunctions.has(key),
          devModeLayerVersions,
          artifact: artifactOf(key),
          serviceDir: serverless.serviceDir,
        },
      }),
    )
  }
  planned.rows = rows
  const devRows = rows.filter((row) => row.mode === 'dev')
  if (devRows.length) {
    pass('functions', {
      message: `${devRows.length} of ${out.functionsWord(keys.length)} can run in Dev Mode`,
    })
  } else {
    fail('functions', {
      reason: 'nothing_to_attach',
      message:
        'No function in this service can run in Dev Mode. The table says why for each one.',
    })
  }
  const missingLayers = []
  if (devRows.length && !deployFirst) {
    // The session's layer calls, so a denial names the permission as the session does.
    const layerLambda = createLayerLambda({ clients, region })
    try {
      for (const arch of [...new Set(devRows.map((row) => row.arch))]) {
        const artifact = await readArtifact(arch)
        if (!(await findLayerVersion({ lambda: layerLambda, artifact }))) {
          missingLayers.push(layerName(arch))
        }
      }
      if (missingLayers.length) {
        pass('layers', {
          reason: 'layers_missing',
          message: `${missingLayers.join(', ')} not published yet: the first session publishes ${missingLayers.length === 1 ? 'it' : 'them'} (lambda:PublishLayerVersion)`,
        })
      } else {
        pass('layers', { message: 'the Dev Mode layers are published' })
      }
    } catch (error) {
      fail('layers', failureOf(error, scope))
    }
  }
  planned.plan = out.buildPlan({
    stage,
    deployFirst,
    brokerName,
    // When the role could not be read, the plan does not claim it will be created.
    brokerExists: Boolean(broker) || !brokerKnown,
    brokerPolicy,
    missingLayers,
    devRows: deployFirst ? [] : devRows,
  })
  return planned
}

/** The plan as JSON: machine codes only; the human text lives in `renderPlan`. */
export const planJson = (plan) =>
  plan && {
    changes: plan.changes.map((change) => ({
      function: change.function,
      action: change.action,
      fields: [...CHANGE_FIELDS],
    })),
    account_setup: plan.accountSetup,
    first_deploy: plan.deployFirst,
  }

export const functionJson = (row) => ({
  name: row.function,
  mode: row.mode,
  ...(row.reason && { reason: row.reason }),
  ...(row.why && { why: row.why }),
  ...(row.notes?.length && { notes: row.notes.map((note) => note.reason) }),
})

/**
 * The `--json` result: ok, or the first failing check's reason, with the status every result
 * gives that reason (action_required only for what a person must act on).
 */
export const dryRunResult = (planned) => {
  const fields = {
    plan: planJson(planned.plan),
    functions: planned.rows.map(functionJson),
    preflight: planned.preflight,
  }
  const failing = planned.preflight.find((check) => !check.ok)
  return failing
    ? envelope(
        errorResult(
          Object.assign(new Error(failing.message), {
            reason: failing.reason ?? 'error',
          }),
          fields,
        ),
      )
    : envelope({
        status: 'ok',
        message: 'Dry run: nothing was changed.',
        ...fields,
      })
}

/**
 * The human text as `[level, text]` pairs, a blank line between sections: the heading, the plan,
 * the function table, each check (its mark in the logger's colours) and what to do next, as the
 * outcome line.
 */
export const renderDryRun = (planned) => {
  const blank = ['blankLine']
  const lines = [
    [
      'notice',
      `Dev Mode dry run for "${planned.service}" on stage "${planned.stage}" ${style.aside(`(${planned.region})`)}`,
    ],
    blank,
  ]
  const planText = planned.plan
    ? out.renderPlan({ plan: planned.plan, region: planned.region })
    : ''
  if (planText) lines.push(['notice', planText], blank)
  if (planned.rows.length) {
    lines.push(['notice', out.renderModeTable(planned.rows)], blank)
  }
  const width = Math.max(
    ...planned.preflight.map((check) => CHECK_LABELS[check.check].length),
  )
  lines.push([
    'notice',
    [
      style.aside('Checks:'),
      ...planned.preflight.map(
        (check) =>
          `  ${check.ok ? style.symbol('✔') : style.error('✖')} ${CHECK_LABELS[check.check].padEnd(width)}  ${check.ok ? style.aside(check.message) : check.message}`,
      ),
    ].join('\n'),
  ])
  lines.push(
    blank,
    planned.preflight.every((check) => check.ok)
      ? [
          'success',
          `Dry run: nothing was changed. Run "${cliCommand('dev')}" to start.`,
        ]
      : [
          'error',
          `Dry run: nothing was changed. Fix what is marked ✖, then run "${cliCommand('dev')}".`,
        ],
  )
  return lines
}

/** Runs `serverless dev --dry-run`: `{ result, human }`. Never throws: a failure is a result. */
export const runDevDryRun = async ({
  serverless,
  provider,
  options,
  deps = {},
}) => {
  try {
    const planned = await planSession({ serverless, provider, options, deps })
    return { result: dryRunResult(planned), human: renderDryRun(planned) }
  } catch (error) {
    const result = envelope(errorResult(error))
    return { result, human: result.message }
  }
}
