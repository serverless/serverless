/**
 * Helpers for live tests of `serverless dev`: run the source CLI over pipes, wait for its
 * output, and delete what a test session created: the account-level resources (the broker role
 * and the layer versions, both named with the test suffix) and the functions' log groups. They
 * also run the finite `dev` commands an agent uses, reading their --json results and the
 * session's record.
 */
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import url from 'url'
import { execFileSync, spawn } from 'child_process'
import { setTimeout as sleep } from 'timers/promises'
import {
  CloudWatchLogsClient,
  DeleteLogGroupCommand,
  DescribeLogGroupsCommand,
  FilterLogEventsCommand,
} from '@aws-sdk/client-cloudwatch-logs'
import {
  DeleteLayerVersionCommand,
  GetFunctionConfigurationCommand,
  InvokeCommand,
  InvokeWithResponseStreamCommand,
  LambdaClient,
  ListLayerVersionsCommand,
} from '@aws-sdk/client-lambda'
import {
  DeleteRoleCommand,
  DeleteRolePolicyCommand,
  GetRoleCommand,
  IAMClient,
  ListRolePoliciesCommand,
} from '@aws-sdk/client-iam'
import {
  DeleteObjectsCommand,
  ListBucketsCommand,
  ListObjectVersionsCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { DescribeEndpointCommand, IoTClient } from '@aws-sdk/client-iot'
import {
  ARCHITECTURES,
  DEVMODE_VARIABLE_NAMES,
  ENV,
  EXEC_WRAPPER,
  brokerRoleName,
  isDevModeLayerArn,
  layerName,
} from '@serverless/framework/lib/plugins/aws/dev/attach/naming.js'
import {
  LIVENESS,
  createDirectMessagingClient,
  pingSession,
} from '@serverless/framework/lib/plugins/aws/dev/relay/liveness.js'

const here = path.dirname(url.fileURLToPath(import.meta.url))
export const SF_CORE_BIN = path.resolve(here, '../../bin/sf-core.js')
// The suffix rule Dev Mode applies to SLS_DEV_TEST_SUFFIX; anything else leaves names unsuffixed.
const SUFFIX = /^[a-z0-9]{1,12}$/

export { newDevModeTestSuffix } from './devModeTestSuffix.js'

export const assertDevModeLayersBuilt = () => {
  const missing = ARCHITECTURES.map((arch) =>
    path.resolve(
      here,
      `../../../serverless/lib/plugins/aws/dev/layer/dist/serverless-dev-${arch}.zip`,
    ),
  ).filter((zip) => !fs.existsSync(zip))
  if (missing.length) {
    throw new Error(
      `Dev Mode layer zips are not built (${missing.join(', ')}). Build them once with "npm run build:devmode:layer -w @serverless/framework" (needs Go).`,
    )
  }
}

/** The source CLI as a child process over pipes (never a pty: no spinners, no prompts). */
export const spawnSourceCli = ({ args, cwd, env = {} }) => {
  const child = spawn(process.execPath, [SF_CORE_BIN, ...args], {
    cwd,
    env: { ...process.env, ...env },
    stdio: 'pipe',
  })
  child.output = ''
  const append = (chunk) => {
    child.output += chunk.toString()
  }
  child.stdout.on('data', append)
  child.stderr.on('data', append)
  child.exited = new Promise((resolve) =>
    child.on('exit', (code, signal) => resolve({ code, signal })),
  )
  // After 'exit' the last output can still be on its way; 'close' comes once it has all arrived.
  child.closed = new Promise((resolve) => child.on('close', () => resolve()))
  return child
}

export const waitForOutput = (child, pattern, timeoutMs = 600_000) =>
  new Promise((resolve, reject) => {
    let done = false
    const finish = (error) => {
      if (done) return
      done = true
      clearTimeout(timer)
      child.stdout.off('data', check)
      child.stderr.off('data', check)
      if (error) reject(error)
      else resolve()
    }
    const timer = setTimeout(
      () =>
        finish(new Error(`timed out waiting for ${pattern}\n${child.output}`)),
      timeoutMs,
    )
    const check = () => {
      if (pattern.test(child.output)) finish()
    }
    child.stdout.on('data', check)
    child.stderr.on('data', check)
    // Decided once the output has all arrived: its last lines can come after the exit.
    Promise.all([child.exited, child.closed]).then(([{ code }]) => {
      if (pattern.test(child.output)) finish()
      else
        finish(
          new Error(`exited with ${code} before ${pattern}\n${child.output}`),
        )
    })
    check()
  })

// IAM reports a missing role under either name, depending on the client.
const isNoSuchEntity = (error) =>
  ['NoSuchEntityException', 'NoSuchEntity'].includes(error?.name)

/** Every version of a layer, across pages. */
const layerVersions = async (lambda, LayerName) => {
  const versions = []
  let Marker
  do {
    const page = await lambda.send(
      new ListLayerVersionsCommand({ LayerName, Marker }),
    )
    versions.push(...(page.LayerVersions ?? []))
    Marker = page.NextMarker
  } while (Marker)
  return versions
}

/** Deletes the suffixed broker role and layer versions; returns whatever is still there. */
export const cleanupDevModeAccountResources = async ({ region, suffix }) => {
  // Without a valid suffix the names below would be the shared, unsuffixed ones.
  if (!SUFFIX.test(suffix ?? '')) {
    throw new Error(`Not a Dev Mode test suffix: "${suffix}"`)
  }
  const lambda = new LambdaClient({ region })
  const iam = new IAMClient({ region })
  const names = { SLS_DEV_TEST_SUFFIX: suffix }
  const RoleName = brokerRoleName(region, names)
  const policies = await iam
    .send(new ListRolePoliciesCommand({ RoleName }))
    .then(
      (r) => r.PolicyNames ?? [],
      () => [],
    )
  for (const PolicyName of policies) {
    await iam.send(new DeleteRolePolicyCommand({ RoleName, PolicyName }))
  }
  await iam.send(new DeleteRoleCommand({ RoleName })).catch((error) => {
    if (!isNoSuchEntity(error)) throw error
  })
  const left = []
  for (const arch of ARCHITECTURES) {
    const LayerName = layerName(arch, names)
    for (const version of await layerVersions(lambda, LayerName)) {
      await lambda.send(
        new DeleteLayerVersionCommand({
          LayerName,
          VersionNumber: version.Version,
        }),
      )
    }
    const after = await layerVersions(lambda, LayerName)
    left.push(...after.map((v) => v.LayerVersionArn))
  }
  const roleLeft = await iam.send(new GetRoleCommand({ RoleName })).then(
    () => true,
    (error) => !isNoSuchEntity(error),
  )
  if (roleLeft) left.push(RoleName)
  return left
}

/**
 * Deletes the log groups whose names start with `/aws/lambda/<functionPrefix>`. Lambda can create
 * a log group again from logs still in flight a few seconds after its function is deleted, so this
 * waits, deletes, and stops only after two empty listings in a row. Returns the log groups still
 * there.
 */
export const deleteLogGroups = async ({ region, functionPrefix }) => {
  // Without a prefix this would delete every Lambda log group in the region.
  if (!functionPrefix) throw new Error('deleteLogGroups needs a functionPrefix')
  const logs = new CloudWatchLogsClient({ region })
  const logGroupNamePrefix = `/aws/lambda/${functionPrefix}`
  const list = async () => {
    const names = []
    let nextToken
    do {
      const page = await logs.send(
        new DescribeLogGroupsCommand({ logGroupNamePrefix, nextToken }),
      )
      names.push(...(page.logGroups ?? []).map((g) => g.logGroupName))
      nextToken = page.nextToken
    } while (nextToken)
    return names
  }
  let emptyInARow = 0
  for (let round = 0; round < 12 && emptyInARow < 2; round += 1) {
    await sleep(10_000)
    const names = await list()
    emptyInARow = names.length ? 0 : emptyInARow + 1
    for (const logGroupName of names) {
      await logs
        .send(new DeleteLogGroupCommand({ logGroupName }))
        .catch((error) => {
          if (error.name !== 'ResourceNotFoundException') throw error
        })
    }
  }
  return list()
}

/** Every version and delete marker under `Prefix` in `Bucket`. */
const objectVersions = async (s3, Bucket, Prefix) => {
  const entries = []
  let KeyMarker
  let VersionIdMarker
  for (;;) {
    const page = await s3.send(
      new ListObjectVersionsCommand({
        Bucket,
        Prefix,
        KeyMarker,
        VersionIdMarker,
      }),
    )
    entries.push(
      ...[...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])].map(
        ({ Key, VersionId }) => ({ Key, VersionId }),
      ),
    )
    if (!page.IsTruncated) return entries
    KeyMarker = page.NextKeyMarker
    VersionIdMarker = page.NextVersionIdMarker
  }
}

/**
 * Deletes what is left under one stage's Dev Mode prefix (`serverless-dev-mode/<service>/<stage>/`,
 * where the relay puts payloads too large for one AWS IoT Core message) in the region's deployment
 * buckets, every version and delete marker, and returns what is still there after. A session
 * sweeps its own prefix as it stops; one that was killed cannot.
 */
export const sweepDevModePrefix = async ({ region, service, stage }) => {
  // Without both, the prefix would cover other services' or stages' objects.
  if (!service || !stage) {
    throw new Error('sweepDevModePrefix needs a service and a stage')
  }
  const s3 = new S3Client({ region })
  const prefix = `serverless-dev-mode/${service}/${stage}/`
  const { Buckets = [] } = await s3.send(new ListBucketsCommand({}))
  const left = []
  for (const { Name: Bucket } of Buckets) {
    if (!Bucket.startsWith(`serverless-framework-deployments-${region}-`)) {
      continue
    }
    const entries = await objectVersions(s3, Bucket, prefix)
    for (let i = 0; i < entries.length; i += 1000) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket,
          Delete: { Objects: entries.slice(i, i + 1000), Quiet: true },
        }),
      )
    }
    left.push(
      ...(await objectVersions(s3, Bucket, prefix)).map(
        ({ Key, VersionId }) => `${Key} (${VersionId})`,
      ),
    )
  }
  return left
}

/**
 * The last `limit` lines the Dev Mode bridge logged in `functionName` since `since` (epoch ms),
 * account ids masked: why its invocations ran the deployed code, read before teardown deletes the
 * log group. Lines from the last few seconds may not have arrived yet.
 */
export const bridgeLogLines = async ({
  region,
  functionName,
  since,
  limit = 40,
}) => {
  const logs = new CloudWatchLogsClient({ region })
  const lines = []
  try {
    let nextToken
    do {
      const page = await logs.send(
        new FilterLogEventsCommand({
          logGroupName: `/aws/lambda/${functionName}`,
          startTime: since,
          filterPattern: '"[sls-dev-bridge]"',
          nextToken,
        }),
      )
      for (const event of page.events ?? []) {
        lines.push(
          event.message.trim().replace(/(?<!\d)\d{12}(?!\d)/g, '<acct>'),
        )
      }
      nextToken = page.nextToken
    } while (nextToken)
  } catch (error) {
    return [`(the bridge's log lines could not be read: ${error.name})`]
  }
  return lines.slice(-limit)
}

/** `error` with the bridge's last log lines in `functionName` appended to its message. */
export const withBridgeLogLines = async (error, options) => {
  const lines = await bridgeLogLines(options)
  error.message += `\nThe bridge's last log lines in ${options.functionName}:\n${lines.join('\n') || '(none)'}`
  return error
}

/**
 * Invokes `functionName` every 10 s until `isThisMachine(body)` says this machine answered (the
 * relay is live: a new broker role can take a few minutes before the functions may use it), at
 * most `timeoutMs`. Resolves how long that took; on timeout, the error carries the bridge's last
 * log lines.
 */
export const waitForRelay = async ({
  region,
  functionName,
  isThisMachine,
  timeoutMs = 300_000,
}) => {
  const lambda = new LambdaClient({ region })
  const started = Date.now()
  for (;;) {
    const out = await lambda.send(
      new InvokeCommand({
        FunctionName: functionName,
        Payload: Buffer.from('{}'),
      }),
    )
    const body = Buffer.from(out.Payload ?? []).toString()
    if (isThisMachine(body)) return Date.now() - started
    if (Date.now() - started > timeoutMs) {
      throw await withBridgeLogLines(
        new Error(
          `${functionName} never ran on this machine within ${timeoutMs / 1000} s`,
        ),
        { region, functionName, since: started },
      )
    }
    await sleep(10_000)
  }
}

/** InvokeWithResponseStream: the chunks with their arrival times, and the completion's error. */
export const invokeStream = async ({ region, functionName, payload = {} }) => {
  const started = Date.now()
  const res = await new LambdaClient({ region }).send(
    new InvokeWithResponseStreamCommand({
      FunctionName: functionName,
      Payload: Buffer.from(JSON.stringify(payload)),
    }),
  )
  const chunks = []
  let complete
  for await (const event of res.EventStream) {
    if (event.PayloadChunk?.Payload) {
      chunks.push({
        atMs: Date.now() - started,
        text: Buffer.from(event.PayloadChunk.Payload).toString(),
      })
    }
    if (event.InvokeComplete) complete = event.InvokeComplete
  }
  return {
    chunks,
    errorCode: complete?.ErrorCode || null,
    errorDetails: complete?.ErrorDetails || null,
  }
}

/**
 * A deployed function's environment, read by invoking it with an event its handler answers with
 * its own process.env. Attached functions pass through to their deployed code, so this is the
 * environment a Lambda execution environment of that function really has. Nothing of it is ever
 * printed: a failed capture reports only what kind of answer came back.
 */
export const captureEnvironment = async ({
  region,
  functionName,
  streaming = false,
  event = { capture: true },
}) => {
  const lambda = new LambdaClient({ region })
  const Payload = Buffer.from(JSON.stringify(event))
  let raw
  let functionError
  if (streaming) {
    const out = await lambda.send(
      new InvokeWithResponseStreamCommand({
        FunctionName: functionName,
        Payload,
      }),
    )
    const parts = []
    for await (const item of out.EventStream) {
      if (item.PayloadChunk?.Payload) {
        parts.push(Buffer.from(item.PayloadChunk.Payload))
      }
      if (item.InvokeComplete?.ErrorCode) {
        functionError = item.InvokeComplete.ErrorCode
      }
    }
    raw = Buffer.concat(parts).toString('utf8')
  } else {
    const out = await lambda.send(
      new InvokeCommand({ FunctionName: functionName, Payload }),
    )
    functionError = out.FunctionError
    raw = Buffer.from(out.Payload ?? []).toString('utf8')
  }
  let result
  try {
    result = JSON.parse(raw)
  } catch {
    result = undefined
  }
  if (!result?.environment || typeof result.environment !== 'object') {
    throw new Error(
      `Capturing the environment of ${functionName} returned no environment (function error ${functionError ?? 'none'}, errorType ${result?.errorType ?? '-'}, errorMessage ${String(result?.errorMessage ?? '-').slice(0, 300)})`,
    )
  }
  return result.environment
}

/**
 * Hands a running `serverless dev` started with SLS_DEV_TEST_FEED=1 one invocation, the way the
 * relay from Lambda will: the Lambda-Runtime headers of a /next response, the event, and the
 * environment of the execution environment it came from.
 */
export const feedInvocation = async ({
  serviceDir,
  functionKey,
  functionArn,
  timeoutSeconds,
  environmentId,
  environment,
  event,
}) => {
  const { url: feedUrl, token } = JSON.parse(
    fs.readFileSync(
      path.join(serviceDir, '.serverless', 'dev', 'test-feed.json'),
      'utf8',
    ),
  )
  const requestId = crypto.randomUUID()
  const response = await fetch(feedUrl, {
    method: 'POST',
    headers: { authorization: token, 'content-type': 'application/json' },
    body: JSON.stringify({
      function: functionKey,
      environmentId,
      headers: {
        'lambda-runtime-aws-request-id': requestId,
        'lambda-runtime-deadline-ms': String(
          Date.now() + timeoutSeconds * 1000,
        ),
        'lambda-runtime-invoked-function-arn': functionArn,
      },
      event,
      environment,
    }),
  })
  const text = await response.text()
  let reply
  let json = true
  try {
    reply = JSON.parse(text)
  } catch {
    // A reply that is not JSON (a proxy's page, a crash) keeps its text for the error below.
    json = false
    reply = { message: text.slice(0, 500) }
  }
  if (response.status !== 200 || !json) {
    throw new Error(
      `The test feed answered ${response.status} for ${functionKey}: ${reply?.message}`,
    )
  }
  return {
    requestId,
    ...reply,
    text: reply.bodyBase64
      ? Buffer.from(reply.bodyBase64, 'base64').toString('utf8')
      : '',
  }
}

/**
 * Runs the source CLI to its end over pipes and keeps stdout and stderr apart, as an agent sees
 * them: a --json result is the only thing on stdout, and human text goes to stderr. `json` is
 * stdout parsed when `args` include --json, otherwise (or when stdout is not one JSON document)
 * null. The process is killed after `timeoutMs` (`timedOut`). A `dev --detach` returns here once
 * its launcher exits: the session process it starts writes to .serverless/dev/session.log, never
 * to these pipes, so a launcher that handed them on would hold this call until the timeout.
 */
export const runSubcommand = async ({
  args,
  cwd,
  env = {},
  timeoutMs = 600_000,
}) => {
  const child = spawn(process.execPath, [SF_CORE_BIN, ...args], {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  // Decoded as a stream: a multi-byte character split across two chunks stays whole.
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => {
    stdout += chunk
  })
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    child.kill('SIGKILL')
  }, timeoutMs)
  const [code, signal] = await new Promise((resolve) =>
    child.on('close', (exitCode, exitSignal) =>
      resolve([exitCode, exitSignal]),
    ),
  )
  clearTimeout(timer)
  let json = null
  if (args.includes('--json')) {
    try {
      json = JSON.parse(stdout)
    } catch {
      json = null
    }
  }
  return { code, signal, stdout, stderr, json, timedOut }
}

/** `<serviceDir>/.serverless/dev`, where a session keeps its record. */
export const devDir = (serviceDir) =>
  path.join(serviceDir, '.serverless', 'dev')

/** The service directory's session file, or null when there is none. */
export const readSessionFile = (serviceDir) => {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(devDir(serviceDir), 'session.json'), 'utf8'),
    )
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

/** The records of an event log (the current session's by default), in order. */
export const readEventRecords = (serviceDir, file = 'session.ndjson') =>
  fs
    .readFileSync(path.join(devDir(serviceDir), file), 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))

/** Whether `pid` is a running process (EPERM means it runs as another user). */
export const isProcessAlive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

/** Resolves once `pid` has exited; throws after `timeoutMs`. */
export const waitForProcessExit = async (pid, timeoutMs = 30_000) => {
  const until = Date.now() + timeoutMs
  while (isProcessAlive(pid)) {
    if (Date.now() > until) {
      throw new Error(`process ${pid} still runs after ${timeoutMs / 1000} s`)
    }
    await sleep(100)
  }
}

const HANDLER_CLIENT = /node-client\.mjs|python_client\.py/

/**
 * The pids of Dev Mode's handler processes (its Node.js and Python runtime clients) whose command
 * line names `marker` (the service directory's name, which the client's JSON argument carries):
 * what a killed session can leave running.
 */
export const handlerProcesses = (marker) => {
  const listing =
    process.platform === 'win32'
      ? execFileSync(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.CommandLine)" }',
          ],
          { encoding: 'utf8', windowsHide: true },
        )
      : // -ww: the whole command line, however wide.
        execFileSync('ps', ['-ax', '-ww', '-o', 'pid=,command='], {
          encoding: 'utf8',
        })
  return listing
    .split(/\r?\n/)
    .filter((line) => HANDLER_CLIENT.test(line) && line.includes(marker))
    .map((line) => Number.parseInt(line.trim(), 10))
    .filter((pid) => Number.isInteger(pid) && pid !== process.pid)
}

/** Resolves once no handler process names `marker`; throws with their pids after `timeoutMs`. */
export const waitForNoHandlerProcesses = async (marker, timeoutMs = 30_000) => {
  const until = Date.now() + timeoutMs
  for (;;) {
    const left = handlerProcesses(marker)
    if (!left.length) return
    if (Date.now() > until) {
      throw new Error(
        `handler processes still run ${timeoutMs / 1000} s after their session ended: ${left.join(', ')}`,
      )
    }
    await sleep(500)
  }
}

/**
 * Waits until AWS IoT Core reads the session `sessionId` as gone (its CLI's connection was
 * dropped), at most `timeoutMs`, and returns the last answer. Until then Dev Mode counts a killed
 * session's functions as still held by it.
 */
export const waitForSessionGone = async ({
  region,
  sessionId,
  timeoutMs = 90_000,
}) => {
  const iot = new IoTClient({ region })
  const { endpointAddress } = await iot.send(
    new DescribeEndpointCommand({ endpointType: 'iot:Data-ATS' }),
  )
  iot.destroy()
  const client = createDirectMessagingClient({
    endpoint: endpointAddress,
    region,
  })
  const until = Date.now() + timeoutMs
  try {
    for (;;) {
      const state = await pingSession({ client, sessionId })
      if (state === LIVENESS.GONE || Date.now() > until) return state
      await sleep(5_000)
    }
  } finally {
    client.destroy()
  }
}

/**
 * What Dev Mode left on a function: the Dev Mode layer ARNs (account ids masked) and the names of
 * its variables, never a value. A restored function has neither: `{ layers: [], variables: [] }`.
 */
export const devModeTraces = async ({ region, functionName }) => {
  const config = await new LambdaClient({ region }).send(
    new GetFunctionConfigurationCommand({ FunctionName: functionName }),
  )
  const names = new Set([...DEVMODE_VARIABLE_NAMES, EXEC_WRAPPER])
  return {
    layers: (config.Layers ?? [])
      .map(({ Arn }) => Arn)
      .filter((arn) => isDevModeLayerArn(arn))
      .map((arn) => arn.replace(/\d{12}/g, '<acct>')),
    variables: Object.keys(config.Environment?.Variables ?? {})
      .filter((name) => names.has(name))
      .sort(),
  }
}

/**
 * The secrets a function carries while a session holds it: the session key and the broker
 * ExternalId (null when absent). Read only to search for them afterwards: keep them in memory
 * and never print them.
 */
export const attachedSecrets = async ({ region, functionName }) => {
  const config = await new LambdaClient({ region }).send(
    new GetFunctionConfigurationCommand({ FunctionName: functionName }),
  )
  const variables = config.Environment?.Variables ?? {}
  return {
    sessionKey: variables[ENV.SESSION_KEY] ?? null,
    externalId: variables[ENV.BROKER_EXTERNAL_ID] ?? null,
  }
}

/**
 * Which `secrets` ({ name: value }) and `patterns` ({ name: RegExp without the g flag }) appear in
 * the files under `dir` or in `texts` ({ name: text }). Returns `{ found, files }`: `found` lists
 * "<where>: <secret name>", never a value, so a failing assertion prints nothing secret, and
 * `files` counts the files read.
 */
export const findSecrets = ({ dir, texts = {}, secrets, patterns = {} }) => {
  for (const [name, value] of Object.entries(secrets)) {
    if (typeof value !== 'string' || value.length < 16) {
      throw new Error(`secret "${name}" is too short to search for`)
    }
  }
  const sources = Object.entries(texts)
  let files = 0
  if (fs.existsSync(dir)) {
    for (const relative of fs.readdirSync(dir, { recursive: true })) {
      const file = path.join(dir, relative)
      if (!fs.statSync(file).isFile()) continue
      files += 1
      sources.push([
        path.join(path.basename(dir), relative),
        fs.readFileSync(file, 'utf8'),
      ])
    }
  }
  const found = []
  for (const [where, text] of sources) {
    for (const [name, value] of Object.entries(secrets)) {
      if (text.includes(value)) found.push(`${where}: ${name}`)
    }
    for (const [name, pattern] of Object.entries(patterns)) {
      if (pattern.test(text)) found.push(`${where}: ${name}`)
    }
  }
  return { found, files }
}
