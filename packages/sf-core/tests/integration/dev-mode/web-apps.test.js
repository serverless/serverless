/**
 * Live: web apps in `serverless dev`. Requests to a web app's real URL reach its server on this
 * machine through the web relay, `--local-only` keeps the real URL on the deployed code, a paused
 * machine leaves requests to the deployed code, large bodies and event streams arrive intact, and
 * every way a session ends (dev stop, kill -9 and the next deploy) puts `main` back on the
 * deployed revision with nothing of Dev Mode left. The suite starts from a broker role as an
 * earlier release wrote it (trust for functions only) and checks that the session widens it and
 * that a functions-only session still runs with it afterwards.
 */
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import url from 'url'
import { execFileSync } from 'child_process'
import { setTimeout as sleep } from 'timers/promises'
import { jest } from '@jest/globals'
import {
  CreateRoleCommand,
  GetRoleCommand,
  GetRolePolicyCommand,
  IAMClient,
  PutRolePolicyCommand,
} from '@aws-sdk/client-iam'
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'
import {
  GetWebFunctionEndpointCommand,
  GetWebFunctionRevisionCommand,
  LambdaWebClient,
  ListWebFunctionEndpointsCommand,
  ListWebFunctionRevisionsCommand,
} from '@aws-sdk/client-lambda-web'
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts'
import { setGlobalRendererSettings } from '@serverless/util'
import {
  BROKER_POLICY_NAME,
  ENV,
  brokerRoleName,
} from '@serverless/framework/lib/plugins/aws/dev/attach/naming.js'
import {
  BROKER_ROLE_DESCRIPTION,
  buildPermissionPolicy,
  buildTrustPolicy,
  policyVersionOf,
  readExternalId,
  trustIsWidened,
} from '@serverless/framework/lib/plugins/aws/dev/attach/broker.js'
import { getTestStageName, runSfCore } from '../../utils/runSfCore.js'
import {
  assertDevModeLayersBuilt,
  bridgeLogLines,
  cleanupDevModeAccountResources,
  deleteLogGroups,
  devDir,
  devModeTraces,
  newDevModeTestSuffix,
  readEventRecords,
  runSubcommand,
  spawnSourceCli,
  sweepDevModePrefix,
  waitForOutput,
  waitForRelay,
} from '../../utils/devMode.js'
import { patternBytes } from './fixture-web-apps/src/bytes.mjs'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

jest.setTimeout(1_800_000)

// SIGSTOP, SIGKILL and process groups: POSIX only. CI runs this file on Linux.
const posixTest = process.platform === 'win32' ? test.skip : test
const sha256 = (value) =>
  crypto.createHash('sha256').update(value).digest('hex')
const mask = (text) => String(text).replace(/(?<!\d)\d{12}(?!\d)/g, '<acct>')
const DEV_DESCRIPTION = /^Serverless Dev Mode /
/** What an app saw of the hop that brought a request, without the caller's address. */
const hopOf = ({ host, forwarded = {} }) => ({
  host,
  'x-forwarded-host': forwarded['x-forwarded-host'],
  'x-forwarded-proto': forwarded['x-forwarded-proto'],
  'x-forwarded-port': forwarded['x-forwarded-port'],
})

describe('Dev Mode runs web apps on this machine (live)', () => {
  const region = 'us-east-1'
  const fixture = path.join(__dirname, 'fixture-web-apps')
  const service = 'devmode-web'
  const stage = getTestStageName()
  // Suffixes the account-level Dev Mode names (broker role, layers), so this suite deletes
  // exactly what it created and never touches the account's own broker role.
  const suffix = newDevModeTestSuffix()
  const functionPrefix = `${service}-${stage}-`
  const fn = (key) => `${functionPrefix}${key}`
  const lambda = new LambdaClient({ region })
  const lambdaWeb = new LambdaWebClient({ region })
  const iam = new IAMClient({ region })
  const roleName = brokerRoleName(region, { SLS_DEV_TEST_SUFFIX: suffix })
  const originalEnv = { ...process.env }
  // What the suite measured, printed once at the end for the record.
  const timings = {}
  // The deployed revision `main` serves for each web app, and each one's real URL.
  const deployedRevision = {}
  const realUrl = {}
  let originalCwd
  let externalId
  let session
  let sessionReadyAt
  let status
  let deployAttempted = false
  let deployed = false

  // runSfCore spies on console.log; the spy is removed after each run, so a second run (and
  // any console.log after it) does not call itself.
  const sls = async (command) => {
    try {
      return await runSfCore({
        coreParams: { options: { stage, region }, command },
        jest,
      })
    } finally {
      jest.restoreAllMocks()
    }
  }
  const running = (child) =>
    Boolean(child) && child.exitCode === null && child.signalCode === null
  const dev = (args = []) =>
    spawnSourceCli({
      args: ['dev', ...args, '--stage', stage, '--region', region],
      cwd: fixture,
      env: { SLS_DEV_TEST_SUFFIX: suffix },
    })
  /** One finite command run to its end, as an agent runs it. */
  const cli = (args, timeoutMs = 600_000) =>
    runSubcommand({
      args: [...args, '--stage', stage, '--region', region],
      cwd: fixture,
      env: { SLS_DEV_TEST_SUFFIX: suffix },
      timeoutMs,
    })
  const expectExit = (result, code) => {
    if (result.code !== code || result.timedOut) {
      throw new Error(
        `exited ${result.code}${result.timedOut ? ' (timed out)' : ''}, expected ${code}\n${mask(result.stderr)}\n${mask(result.stdout)}`,
      )
    }
  }
  /** Stops a running session: Ctrl+C restores, SIGKILL if that takes too long. */
  const stop = async (child) => {
    if (!running(child)) return
    child.kill('SIGCONT')
    child.kill('SIGINT')
    const timer = setTimeout(() => child.kill('SIGKILL'), 120_000)
    await child.exited
    clearTimeout(timer)
  }
  // Prints a session's output when an assertion about it fails, before teardown removes the
  // stage. The CLI prints no account id; masked all the same.
  const withOutput = async (child, check) => {
    try {
      await check()
    } catch (error) {
      console.error(mask(child?.output))
      throw error
    }
  }
  /** Calls `read` every `every` ms until it returns something truthy; throws after `ms`. */
  const pollUntil = async (read, { ms, every = 1_000, what }) => {
    const until = Date.now() + ms
    let last
    for (;;) {
      try {
        const value = await read()
        if (value) return value
      } catch (error) {
        last = error
      }
      if (Date.now() > until) {
        throw new Error(
          `timed out after ${ms / 1000} s waiting for ${what}${last ? ` (last error: ${last.message})` : ''}`,
        )
      }
      await sleep(every)
    }
  }
  /** A request and its JSON answer, with how long it took; a body that is not JSON is kept. */
  const request = async (target, init = {}) => {
    const started = Date.now()
    const response = await fetch(target, {
      ...init,
      signal: AbortSignal.timeout(60_000),
    })
    const text = await response.text()
    let body
    try {
      body = JSON.parse(text)
    } catch {
      body = { text: text.slice(0, 300) }
    }
    return { status: response.status, body, ms: Date.now() - started }
  }
  const endpointOf = (key, endpointName) =>
    lambdaWeb.send(
      new GetWebFunctionEndpointCommand({
        functionName: fn(key),
        endpointName,
      }),
    )
  const mainRevisionId = async (key) =>
    [...((await endpointOf(key, 'main')).revisionWeights ?? [])].sort(
      (a, b) => (b.weight ?? 0) - (a.weight ?? 0),
    )[0]?.revisionId
  /** What Dev Mode has on a web app: its endpoints and its revisions, by name and role. */
  const webAppTraces = async (key) => {
    const functionName = fn(key)
    const endpoints = []
    let nextToken
    do {
      const page = await lambdaWeb.send(
        new ListWebFunctionEndpointsCommand({ functionName, nextToken }),
      )
      endpoints.push(...(page.endpoints ?? []))
      nextToken = page.nextToken
    } while (nextToken)
    const revisions = []
    nextToken = undefined
    do {
      const page = await lambdaWeb.send(
        new ListWebFunctionRevisionsCommand({ functionName, nextToken }),
      )
      revisions.push(...(page.revisions ?? []))
      nextToken = page.nextToken
    } while (nextToken)
    const devRevisions = []
    for (const { revisionId, description } of revisions) {
      const revision = await lambdaWeb.send(
        new GetWebFunctionRevisionCommand({ functionName, revisionId }),
      )
      const variables = revision.serviceConfig?.environmentVariables ?? {}
      if (
        variables[ENV.REVISION_ROLE] ||
        DEV_DESCRIPTION.test(description ?? '')
      ) {
        devRevisions.push({
          revisionId,
          role: variables[ENV.REVISION_ROLE] ?? null,
        })
      }
    }
    return {
      endpoints: endpoints.map(({ endpointName }) => endpointName).sort(),
      devRevisions,
    }
  }
  /** The web app is as the deploy left it: `main` on its revision, nothing of Dev Mode. */
  const expectWebAppRestored = async (key) => {
    expect(await mainRevisionId(key)).toBe(deployedRevision[key])
    expect(await webAppTraces(key)).toEqual({
      endpoints: ['main'],
      devRevisions: [],
    })
  }
  const devStatus = async () => {
    const result = await cli(['dev', 'status', '--json'])
    expectExit(result, 0)
    return result.json
  }
  /** A session started with `args`, once it printed its ready line. */
  const startSession = async (args, ready) => {
    const child = dev(args)
    await waitForOutput(child, ready, 600_000)
    return child
  }
  /**
   * The servers a killed session left running on this machine (theirs is a process group of its
   * own): the processes whose command line runs a server file of the fixture and whose working
   * directory is the fixture. Linux only, where /proc tells the working directory.
   */
  const leftoverServers = () => {
    if (process.platform !== 'linux') return []
    const listing = execFileSync('ps', ['-ax', '-ww', '-o', 'pid=,command='], {
      encoding: 'utf8',
    })
    return listing
      .split('\n')
      .filter((line) => /server\.mjs/.test(line))
      .map((line) => Number.parseInt(line.trim(), 10))
      .filter((pid) => {
        try {
          return fs.readlinkSync(`/proc/${pid}/cwd`) === fixture
        } catch {
          return false
        }
      })
  }
  /** The bridge's last log lines in a web app, for a failure message. */
  const webBridgeLines = (key, since) =>
    bridgeLogLines({
      region,
      functionName: fn(key),
      logGroupName: `/aws/lambda/web/${fn(key)}`,
      filterPattern: '"Dev Mode"',
      since,
    })

  beforeAll(async () => {
    // Captured before anything that can throw, so afterAll never restores an undefined cwd.
    originalCwd = process.cwd()
    // The layer zips and the web bridge zip are gitignored build artifacts.
    assertDevModeLayersBuilt()
    const bridgeZip = path.resolve(
      __dirname,
      '../../../../serverless/lib/plugins/aws/dev/web/bridge/dist/sls-dev-web-bridge.zip',
    )
    if (!fs.existsSync(bridgeZip)) {
      throw new Error(
        `The Dev Mode web bridge is not built (${bridgeZip}). Build it with "npm run build:devmode:web-bridge -w @serverless/framework".`,
      )
    }
    process.chdir(fixture)
    setGlobalRendererSettings({ isInteractive: false, logLevel: 'error' })
    // Mutated in place: child processes inherit the native environment.
    process.env.SERVERLESS_PLATFORM_STAGE = 'dev'
    if (process.env.SERVERLESS_LICENSE_KEY_DEV) {
      process.env.SERVERLESS_LICENSE_KEY =
        process.env.SERVERLESS_LICENSE_KEY_DEV
    }
    delete process.env.SERVERLESS_ACCESS_KEY
    process.env.SLS_DEV_TEST_SUFFIX = suffix
    // A record a failed earlier run left would mix with this run's.
    fs.rmSync(devDir(fixture), { recursive: true, force: true })
    // The build output `cmd` deploys (dist/ is gitignored): the server its dev.command runs.
    fs.mkdirSync(path.join(fixture, 'dist'), { recursive: true })
    fs.writeFileSync(
      path.join(fixture, 'dist', 'server.mjs'),
      "import '../src/cmd-server.mjs'\n",
    )
    // The broker role as an earlier release wrote it: trust for functions only and version 1 of
    // the permission policy. The first session with web apps must widen and update it.
    const caller = await new STSClient({ region }).send(
      new GetCallerIdentityCommand({}),
    )
    const identity = {
      accountId: caller.Account,
      partition: caller.Arn.split(':')[1],
    }
    externalId = crypto.randomBytes(16).toString('hex')
    await iam.send(
      new CreateRoleCommand({
        RoleName: roleName,
        Description: BROKER_ROLE_DESCRIPTION,
        AssumeRolePolicyDocument: JSON.stringify(
          buildTrustPolicy({ identity, region, externalId, web: false }),
        ),
        MaxSessionDuration: 3600,
      }),
    )
    await iam.send(
      new PutRolePolicyCommand({
        RoleName: roleName,
        PolicyName: BROKER_POLICY_NAME,
        PolicyDocument: JSON.stringify(
          buildPermissionPolicy({ identity, region, version: 1 }),
        ),
      }),
    )
    deployAttempted = true
    await sls(['deploy'])
    deployed = true
    for (const key of ['api', 'cmd']) {
      const main = await endpointOf(key, 'main')
      deployedRevision[key] = await mainRevisionId(key)
      realUrl[key] = `https://${main.domainName}`
      // The deployed code answers before any session: what the fallback must give later.
      const answer = await pollUntil(
        async () => {
          const response = await request(`${realUrl[key]}/whoami`)
          return response.status === 200 && response
        },
        { ms: 120_000, every: 5_000, what: `${key} to answer once deployed` },
      )
      expect(answer.body).toMatchObject({ app: key, ran: 'deployed' })
      timings.deployedForwardedHeaders = Object.keys(
        answer.body.forwarded,
      ).sort()
      timings[`deployedHop_${key}`] = hopOf(answer.body)
    }
    session = dev(['--local-only', 'cmd'])
    await withOutput(session, () =>
      waitForOutput(
        session,
        /Dev Mode on · 1 of 1 function and 2 of 2 web apps/,
        600_000,
      ),
    )
    sessionReadyAt = Date.now()
    status = await devStatus()
  })

  afterAll(async () => {
    const failures = []
    if (running(session)) await stop(session)
    if (deployed) {
      // A killed session cannot restore what it attached: restore it first.
      const restore = await cli(['dev', 'restore'], 300_000)
      if (restore.code !== 0) {
        failures.push(`dev restore exited ${restore.code}:\n${restore.stderr}`)
      }
    }
    // The killed session's server keeps running in its own process group.
    for (const pid of leftoverServers()) {
      try {
        process.kill(-pid, 'SIGKILL')
      } catch {
        try {
          process.kill(pid, 'SIGKILL')
        } catch {
          // Gone meanwhile.
        }
      }
    }
    if (deployAttempted) {
      await sls(['remove']).catch((error) =>
        failures.push(`remove: ${error.message}`),
      )
    }
    const left = await cleanupDevModeAccountResources({ region, suffix }).catch(
      (error) => [error.message],
    )
    if (left.length) failures.push(`left behind: ${left.join(', ')}`)
    if (deployAttempted) {
      for (const prefix of [functionPrefix, `web/${functionPrefix}`]) {
        const logGroups = await deleteLogGroups({
          region,
          functionPrefix: prefix,
        }).catch((error) => [error.message])
        if (logGroups.length) {
          failures.push(`log groups left behind: ${logGroups.join(', ')}`)
        }
      }
      // The killed session never swept its payload objects.
      const objects = await sweepDevModePrefix({
        region,
        service,
        stage,
      }).catch((error) => [error.message])
      if (objects.length) {
        failures.push(`Dev Mode objects left behind: ${objects.join(', ')}`)
      }
    }
    fs.rmSync(path.join(fixture, 'dist'), { recursive: true, force: true })
    console.info(`Web apps Dev Mode timings: ${JSON.stringify(timings)}`)
    // Restored before the environment: later test files in this worker must not resolve this
    // fixture.
    process.chdir(originalCwd)
    for (const key of Object.keys(process.env)) delete process.env[key]
    Object.assign(process.env, originalEnv)
    if (failures.length) {
      throw new Error(
        `Dev Mode web apps suite teardown (stage ${stage}, suffix ${suffix}) failed:\n${failures.join('\n')}`,
      )
    }
  })

  test('dev status lists both web apps: api on its real URL, cmd on its local URL only', () => {
    expect(status.web_apps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'api',
          mode: 'dev',
          url: realUrl.api,
        }),
        expect.objectContaining({
          name: 'cmd',
          mode: 'local',
          url: realUrl.cmd,
          local_url: expect.stringMatching(/^http:\/\/localhost:\d+$/),
        }),
      ]),
    )
    const ready = readEventRecords(fixture).find(
      (record) => record.type === 'session.ready',
    )
    expect(ready).toBeDefined()
  })

  test("the real URL is answered by the server on this machine, which runs without Dev Mode's variables", async () => {
    // `main` moved to the dev revision during the attach: the deployed revision serves it no more.
    expect(await mainRevisionId('api')).not.toBe(deployedRevision.api)
    const devRevision = (await webAppTraces('api')).devRevisions.find(
      ({ role }) => role === 'dev',
    )
    expect(devRevision).toBeDefined()
    // A web function has no AWS_LAMBDA_FUNCTION_NAME: the attach names it to the bridge.
    const { serviceConfig } = await lambdaWeb.send(
      new GetWebFunctionRevisionCommand({
        functionName: fn('api'),
        revisionId: devRevision.revisionId,
      }),
    )
    expect(serviceConfig.environmentVariables[ENV.WEB_FUNCTION]).toBe(fn('api'))
    // A broker role whose trust was just widened can take a few minutes to be usable: the bridge
    // runs the deployed code until it is.
    const since = Date.now()
    let first
    let attempts = 0
    try {
      first = await pollUntil(
        async () => {
          attempts += 1
          const answer = await request(`${realUrl.api}/whoami`)
          return answer.body.ran === 'this-machine' && answer
        },
        { ms: 300_000, every: 2_000, what: 'api to answer from this machine' },
      )
    } catch (error) {
      error.message += `\nThe bridge's last log lines:\n${(await webBridgeLines('api', since)).join('\n')}`
      throw error
    }
    timings.firstLocalAnswerAfterReadyMs = Date.now() - sessionReadyAt
    timings.firstLocalAnswerAttempts = attempts
    if (attempts > 3) {
      console.warn(
        `api answered from this machine only after ${attempts} attempts (${timings.firstLocalAnswerAfterReadyMs} ms after the session was ready): the widened trust took a while to work`,
      )
    }
    timings.firstLocalAnswerRequestMs = first.ms
    expect(first.status).toBe(200)
    expect(first.body).toMatchObject({
      app: 'api',
      ran: 'this-machine',
      devVariables: [],
    })
    timings.relayForwardedHeaders = Object.keys(first.body.forwarded).sort()
    timings.relayHop = hopOf(first.body)
    // The server gets its own address as Host, and the real one in X-Forwarded-Host, so dev
    // servers that check the host accept the request and apps build their links on the real URL.
    expect(first.body.host).toMatch(/^127\.0\.0\.1:\d+$/)
    expect(first.body.forwarded['x-forwarded-host']).toBe(
      new URL(realUrl.api).host,
    )
    expect(first.body.forwarded['x-forwarded-proto']).toBe('https')
    // A warm request through the relay.
    const warm = await request(`${realUrl.api}/whoami`)
    expect(warm.body.ran).toBe('this-machine')
    timings.warmRelayRequestMs = warm.ms
  })

  test('dev wait --for request returns the request, dev requests lists it and dev replay runs it here again', async () => {
    const { cursor } = await devStatus()
    const body = JSON.stringify({ order: crypto.randomUUID() })
    const answer = await request(`${realUrl.api}/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
    expect(answer.body).toMatchObject({
      ran: 'this-machine',
      bytes: Buffer.byteLength(body),
      sha256: sha256(body),
    })
    const waited = await cli(
      [
        'dev',
        'wait',
        '--for',
        'request',
        '--web-app',
        'api',
        '--after',
        cursor,
        '--timeout',
        '120',
        '--json',
      ],
      180_000,
    )
    expectExit(waited, 0)
    expect(waited.json.event).toMatchObject({
      type: 'request.end',
      web_app: 'api',
      method: 'POST',
      path: '/echo',
      source: 'relay',
      outcome: 'answered',
      status_code: 200,
    })
    const requestId = waited.json.event.request_id
    const listed = await cli(['dev', 'requests', '--web-app', 'api', '--json'])
    expectExit(listed, 0)
    expect(listed.json.requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'request',
          web_app: 'api',
          request_id: requestId,
          method: 'POST',
        }),
      ]),
    )
    const replayed = await cli(
      ['dev', 'replay', requestId.slice(0, 8), '--json'],
      180_000,
    )
    expectExit(replayed, 0)
    expect(replayed.json).toMatchObject({
      kind: 'request',
      replay_of: requestId,
      web_app: 'api',
      outcome: 'answered',
      status_code: 200,
    })
    const response =
      typeof replayed.json.response?.body === 'string'
        ? JSON.parse(replayed.json.response.body)
        : replayed.json.response
    expect(response).toMatchObject({
      ran: 'this-machine',
      sha256: sha256(body),
    })
  })

  test('--local-only: the real URL keeps the deployed code, the local URL runs here with the role credentials', async () => {
    const cmd = status.web_apps.find(({ name }) => name === 'cmd')
    expect(await mainRevisionId('cmd')).toBe(deployedRevision.cmd)
    expect((await webAppTraces('cmd')).endpoints).toEqual([
      'main',
      'sls-dev-local',
    ])
    const real = await request(`${realUrl.cmd}/whoami`)
    expect(real.body).toMatchObject({ app: 'cmd', ran: 'deployed' })
    const local = await request(`${cmd.local_url}/whoami`)
    expect(local.body).toMatchObject({
      app: 'cmd',
      ran: 'this-machine',
      devVariables: [],
    })
    // The role credentials come from sls-dev-local once the session fetched them; a cold dev
    // revision can delay that.
    const started = Date.now()
    const caller = await pollUntil(
      async () => {
        const answer = await request(`${cmd.local_url}/caller`)
        return answer.status === 200 && answer.body.callerArn && answer
      },
      { ms: 120_000, every: 2_000, what: 'cmd to get role credentials' },
    )
    timings.localOnlyCredentialsMs = Date.now() - started
    // The web function's execution role, not the developer's identity.
    expect(mask(caller.body.callerArn)).toMatch(
      new RegExp(
        `^arn:aws:sts::<acct>:assumed-role/${service}-${stage}-${region}-lambdaRole/`,
      ),
    )
    // api's local URL, when it has one, reaches the same server as its real URL.
    const api = status.web_apps.find(({ name }) => name === 'api')
    timings.apiLocalUrl = Boolean(api.local_url)
    if (api.local_url) {
      const apiLocal = await request(`${api.local_url}/whoami`)
      expect(apiLocal.body).toMatchObject({ app: 'api', ran: 'this-machine' })
    }
  })

  test('a 200 KiB request body and a 2 MB response arrive byte for byte', async () => {
    const upload = crypto.randomBytes(200 * 1024)
    const echoed = await request(`${realUrl.api}/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: upload,
    })
    timings.upload200KiBMs = echoed.ms
    expect(echoed.body).toEqual({
      app: 'api',
      ran: 'this-machine',
      bytes: upload.length,
      sha256: sha256(upload),
    })
    const size = 2_000_000
    const started = Date.now()
    const response = await fetch(`${realUrl.api}/bytes?size=${size}`, {
      signal: AbortSignal.timeout(120_000),
    })
    const received = Buffer.from(await response.arrayBuffer())
    timings.download2MBMs = Date.now() - started
    expect(response.status).toBe(200)
    expect(response.headers.get('x-ran')).toBe('this-machine')
    expect(received.length).toBe(size)
    // A boolean: a failure does not print two megabytes.
    expect(received.equals(patternBytes(size))).toBe(true)
  })

  test('a server-sent event stream arrives in order, as it is written', async () => {
    const started = Date.now()
    const response = await fetch(`${realUrl.api}/events?count=10&gapMs=200`, {
      signal: AbortSignal.timeout(60_000),
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toMatch(/^text\/event-stream/)
    const decoder = new TextDecoder()
    const arrivals = []
    let text = ''
    for await (const chunk of response.body) {
      const piece = decoder.decode(chunk, { stream: true })
      text += piece
      for (const match of piece.matchAll(/data: (\d+)/g)) {
        arrivals.push({ n: Number(match[1]), atMs: Date.now() - started })
      }
    }
    expect(text).toBe(
      Array.from(
        { length: 10 },
        (_, i) => `id: ${i}\ndata: ${i} this-machine\n\n`,
      ).join(''),
    )
    // Streamed, not buffered: the last event arrives well after the first.
    expect(arrivals.map(({ n }) => n)).toEqual([...Array(10).keys()])
    expect(arrivals[9].atMs - arrivals[0].atMs).toBeGreaterThanOrEqual(1_200)
    timings.sseSpreadMs = arrivals[9].atMs - arrivals[0].atMs
  })

  posixTest(
    'with the CLI paused, requests get the deployed code from the fallback, Authorization intact, and come back after',
    async () => {
      const token = `Bearer ${crypto.randomBytes(24).toString('hex')}`
      session.kill('SIGSTOP')
      const pausedAt = Date.now()
      let fallback
      try {
        await sleep(1_000)
        fallback = await request(`${realUrl.api}/whoami`, {
          headers: { authorization: token },
        }).catch(async (error) => {
          throw new Error(
            `The fallback did not answer (${error.message}); the bridge's last log lines:\n${(await webBridgeLines('api', pausedAt)).join('\n')}`,
          )
        })
        // Paused for 10 s in all.
        await sleep(Math.max(0, 10_000 - (Date.now() - pausedAt)))
      } finally {
        session.kill('SIGCONT')
      }
      timings.fallbackRequestMs = fallback.ms
      if (fallback.status !== 200) {
        console.error(
          `The fallback answered ${fallback.status}; the bridge's last log lines:\n${(await webBridgeLines('api', pausedAt)).join('\n')}`,
        )
      }
      timings.fallbackForwardedHeaders = Object.keys(
        fallback.body.forwarded ?? {},
      ).sort()
      timings.fallbackHop = hopOf(fallback.body)
      expect(fallback.status).toBe(200)
      expect(fallback.body).toMatchObject({ app: 'api', ran: 'deployed' })
      // The app's own Authorization reaches the deployed code as the caller sent it.
      expect(fallback.body.authorizationDigest === sha256(token)).toBe(true)
      expect(fallback.ms).toBeLessThan(10_000)
      // The deployed code reached through sls-dev-fallback still learns the real host.
      expect(fallback.body.forwarded['x-forwarded-host']).toBe(
        new URL(realUrl.api).host,
      )
      const resumedAt = Date.now()
      await pollUntil(
        async () =>
          (await request(`${realUrl.api}/whoami`)).body.ran === 'this-machine',
        { ms: 60_000, every: 1_000, what: 'api to answer here again' },
      )
      timings.backAfterResumeMs = Date.now() - resumedAt
      expect(running(session)).toBe(true)
    },
  )

  test('the broker trust was widened to web functions, with its ExternalId kept', async () => {
    const { Role } = await iam.send(new GetRoleCommand({ RoleName: roleName }))
    expect(trustIsWidened(Role)).toBe(true)
    // A boolean: a failure never prints the ExternalId.
    expect(readExternalId(Role) === externalId).toBe(true)
    const { PolicyDocument } = await iam.send(
      new GetRolePolicyCommand({
        RoleName: roleName,
        PolicyName: BROKER_POLICY_NAME,
      }),
    )
    expect(
      policyVersionOf(JSON.parse(decodeURIComponent(PolicyDocument))),
    ).toBe(2)
  })

  test('dev stop puts main back on the deployed revision and leaves nothing of Dev Mode', async () => {
    const result = await cli(['dev', 'stop', '--json'], 480_000)
    expectExit(result, 0)
    expect(result.json).toMatchObject({
      status: 'ok',
      message: 'Dev Mode off · 1 function and 2 web apps restored.',
      restore: { restored: 3, failed: 0 },
      web_apps: { restored: 2, failed: 0 },
    })
    await session.exited
    await withOutput(session, async () => {
      expect(session.exitCode).toBe(0)
      for (const key of ['api', 'cmd']) await expectWebAppRestored(key)
      expect(await devModeTraces({ region, functionName: fn('fn') })).toEqual({
        layers: [],
        variables: [],
      })
    })
    const after = await pollUntil(
      async () => {
        const answer = await request(`${realUrl.api}/whoami`)
        return answer.body.ran === 'deployed' && answer
      },
      { ms: 30_000, every: 1_000, what: 'api to serve the deployed code' },
    )
    expect(after.status).toBe(200)
  })

  test('a functions-only session afterwards runs its function here with the widened broker role', async () => {
    session = await startSession(
      ['--skip-web-app', 'api', '--skip-web-app', 'cmd'],
      /Dev Mode on · 1 of 1 function/,
    )
    await waitForRelay({
      region,
      functionName: fn('fn'),
      isThisMachine: (body) => /"ran":\s?"this-machine"/.test(body),
    })
    const out = await lambda.send(
      new InvokeCommand({ FunctionName: fn('fn'), Payload: '{}' }),
    )
    expect(JSON.parse(Buffer.from(out.Payload).toString())).toEqual({
      ran: 'this-machine',
    })
    // Nothing of Dev Mode on the skipped web apps.
    for (const key of ['api', 'cmd']) await expectWebAppRestored(key)
    await stop(session)
    await withOutput(session, async () => {
      expect(session.exitCode).toBe(0)
      expect(await devModeTraces({ region, functionName: fn('fn') })).toEqual({
        layers: [],
        variables: [],
      })
    })
  })

  posixTest(
    'after kill -9, an unchanged deploy restores the web apps before it deploys',
    async () => {
      session = await startSession([], /Dev Mode on · /)
      expect(await mainRevisionId('api')).not.toBe(deployedRevision.api)
      session.kill('SIGKILL')
      await session.exited
      const deploy = await cli(['deploy'], 900_000)
      expectExit(deploy, 0)
      const output = `${deploy.stdout}\n${deploy.stderr}`
      try {
        const restoredAt = output.search(
          /Restored 1 function and the web apps api and cmd from Dev Mode/,
        )
        expect(restoredAt).toBeGreaterThanOrEqual(0)
        // Restored first: the deploy's outcome comes after.
        const deployedAt = output.search(
          /Service deployed to stack|No changes to deploy/,
        )
        expect(deployedAt).toBeGreaterThan(restoredAt)
        for (const key of ['api', 'cmd']) await expectWebAppRestored(key)
        expect(await devModeTraces({ region, functionName: fn('fn') })).toEqual(
          { layers: [], variables: [] },
        )
      } catch (error) {
        console.error(mask(output))
        throw error
      }
    },
  )
})
