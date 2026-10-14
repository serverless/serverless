/**
 * Live: Dev Mode driven the way a coding agent drives it, through the finite commands and their
 * --json results only: a detached start, `dev wait`, a TypeScript and a Python handler answering
 * real invocations from this machine, a function URL request recorded with its credentials
 * redacted, `dev requests`, `dev replay`, `dev status`, the line `serverless invoke` prints, a
 * second start, a killed session replaced by a new one, and `dev stop`. Then a double SIGTERM
 * during a foreground session's restore (POSIX only: Windows has no signal a process can catch),
 * and a search of everything under .serverless/dev, and of every output, for secrets.
 * The only file of this directory that CI also runs on Windows.
 */
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import url from 'url'
import { execFileSync } from 'child_process'
import { setTimeout as sleep } from 'timers/promises'
import { jest } from '@jest/globals'
import {
  GetFunctionUrlConfigCommand,
  InvokeCommand,
  LambdaClient,
} from '@aws-sdk/client-lambda'
import { setGlobalRendererSettings } from '@serverless/util'
import { getTestStageName, runSfCore } from '../../utils/runSfCore.js'
import {
  assertDevModeLayersBuilt,
  attachedSecrets,
  cleanupDevModeAccountResources,
  deleteLogGroups,
  devDir,
  devModeTraces,
  findSecrets,
  isProcessAlive,
  newDevModeTestSuffix,
  readEventRecords,
  readSessionFile,
  runSubcommand,
  spawnSourceCli,
  sweepDevModePrefix,
  waitForNoHandlerProcesses,
  waitForOutput,
  waitForProcessExit,
  waitForRelay,
  waitForSessionGone,
} from '../../utils/devMode.js'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

jest.setTimeout(1_800_000)

const hasPython = (() => {
  try {
    execFileSync(process.platform === 'win32' ? 'python' : 'python3', [
      '-c',
      'import sys; assert sys.version_info >= (3, 9)',
    ])
    return true
  } catch {
    return false
  }
})()
// On Windows, Node ends a process at once for any signal: nothing could restore.
const posixTest = process.platform === 'win32' ? test.skip : test
const withPython = hasPython ? test : test.skip
const sha256 = (value) =>
  crypto.createHash('sha256').update(value).digest('hex')
const ranHere = (body) => /"ran":\s?"this-machine"/.test(body)
const CURSOR = /^s_[0-9a-f]{12}:[1-9]\d*$/

describe('Dev Mode for coding agents (live)', () => {
  const region = 'us-east-1'
  const fixture = path.join(__dirname, 'fixture-agent-loop')
  const service = 'devmode-agent'
  const stage = getTestStageName()
  // Suffixes the account-level Dev Mode names (broker role, layers), so this suite deletes
  // exactly what it created.
  const suffix = newDevModeTestSuffix()
  const functionPrefix = `${service}-${stage}-`
  const fn = (key) => `${functionPrefix}${key}`
  const lambda = new LambdaClient({ region })
  const originalEnv = { ...process.env }
  // The functions this machine can run: Python only where a Python 3.9+ is on PATH.
  const devKeys = hasPython ? ['api', 'python'] : ['api']
  // Random per run and held in memory only; the last test searches for each of them.
  const secrets = {
    'the function environment value': crypto.randomBytes(32).toString('hex'),
    'the Authorization header value': crypto.randomBytes(32).toString('hex'),
    'the cookie value': crypto.randomBytes(32).toString('hex'),
    'the x-api-key value': crypto.randomBytes(32).toString('hex'),
  }
  const controlTokens = []
  // The session keys and broker ExternalIds the functions carried while attached.
  const attached = []
  // Every output of the run, searched for secrets by the last test.
  const outputs = {}
  const ids = {}
  let originalCwd
  let deployAttempted = false
  let deployed = false
  let first
  let second
  let foreground

  const sls = (command) =>
    runSfCore({ coreParams: { options: { stage, region }, command }, jest })
  /** One command run to its end, as an agent runs it; its output is kept for the search. */
  const cli = async (name, args, timeoutMs = 600_000) => {
    const result = await runSubcommand({
      args: [...args, '--stage', stage, '--region', region],
      cwd: fixture,
      env: { SLS_DEV_TEST_SUFFIX: suffix },
      timeoutMs,
    })
    outputs[`${name} (stdout)`] = result.stdout
    outputs[`${name} (stderr)`] = result.stderr
    return result
  }
  /** Throws with the command's output when its exit code is not `code`. */
  const expectExit = (result, code) => {
    if (result.code !== code || result.timedOut) {
      throw new Error(
        `exited ${result.code}${result.timedOut ? ' (timed out)' : ''}, expected ${code}\n${result.stderr}\n${result.stdout}`,
      )
    }
  }
  const sdkInvoke = async (key, event = {}) => {
    const out = await lambda.send(
      new InvokeCommand({
        FunctionName: fn(key),
        Payload: Buffer.from(JSON.stringify(event)),
      }),
    )
    return {
      functionError: out.FunctionError,
      body: JSON.parse(Buffer.from(out.Payload ?? []).toString()),
    }
  }
  const readInvocationFile = (file) =>
    JSON.parse(fs.readFileSync(path.join(fixture, file), 'utf8'))
  /**
   * An agent's wait: the next end of `functionKey` after `after`, again after each one that is not
   * `requestId` (a relay check can end just after the cursor was read).
   */
  const waitForEnd = async ({ name, functionKey, requestId, after }) => {
    let cursor = after
    for (let round = 1; round <= 5; round += 1) {
      const waited = await cli(
        `${name} ${round}`,
        [
          'dev',
          'wait',
          '--for',
          'invocation',
          '--function',
          functionKey,
          '--after',
          cursor,
          '--json',
        ],
        180_000,
      )
      expectExit(waited, 0)
      // The result's cursor is the matched record's, so --after it continues right after that
      // record and skips nothing written meanwhile.
      expect(waited.json.cursor).toBe(
        `${waited.json.event.session_id}:${waited.json.event.seq}`,
      )
      if (waited.json.event.request_id === requestId) return waited.json.event
      cursor = waited.json.cursor
    }
    throw new Error(`dev wait never returned ${requestId} of ${functionKey}`)
  }
  const expectRestored = async () => {
    for (const key of ['api', 'python']) {
      expect(await devModeTraces({ region, functionName: fn(key) })).toEqual({
        layers: [],
        variables: [],
      })
    }
  }

  beforeAll(async () => {
    // Captured before anything that can throw, so afterAll never restores an undefined cwd.
    originalCwd = process.cwd()
    assertDevModeLayersBuilt()
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
    process.env.DEV_MODE_FIXTURE_SECRET =
      secrets['the function environment value']
    deployAttempted = true
    await sls(['deploy'])
    deployed = true
    // Only the deployed functions hold the value from here on: the sessions never see it in
    // their own environment, so a handler that returns its digest got it from the deployment.
    delete process.env.DEV_MODE_FIXTURE_SECRET
  })

  afterAll(async () => {
    const failures = []
    if (
      foreground &&
      foreground.exitCode === null &&
      foreground.signalCode === null
    ) {
      foreground.kill('SIGINT')
      const timer = setTimeout(() => foreground.kill('SIGKILL'), 120_000)
      await foreground.exited
      clearTimeout(timer)
    }
    // A detached session a failed test left running: stop it as an agent would, then kill it.
    const running = readSessionFile(fixture)
    if (running && isProcessAlive(running.pid)) {
      const stop = await cli(
        'teardown stop',
        ['dev', 'stop', '--json'],
        480_000,
      )
      if (stop.code !== 0) {
        failures.push(`dev stop exited ${stop.code}:\n${stop.stderr}`)
      }
      if (isProcessAlive(running.pid)) process.kill(running.pid, 'SIGKILL')
    }
    if (deployed) {
      const restore = await cli('teardown restore', ['dev', 'restore'], 300_000)
      if (restore.code !== 0) {
        failures.push(`dev restore exited ${restore.code}:\n${restore.stderr}`)
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
      const logGroups = await deleteLogGroups({ region, functionPrefix }).catch(
        (error) => [error.message],
      )
      if (logGroups.length) {
        failures.push(`log groups left behind: ${logGroups.join(', ')}`)
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
    process.chdir(originalCwd)
    for (const key of Object.keys(process.env)) delete process.env[key]
    Object.assign(process.env, originalEnv)
    if (failures.length) {
      throw new Error(
        `Dev Mode agent-loop suite teardown (stage ${stage}, suffix ${suffix}) failed:\n${failures.join('\n')}`,
      )
    }
  })

  test('--detach starts a session, returns once it is ready, and leaves it running', async () => {
    const result = await cli(
      'dev --detach',
      ['dev', '--detach', '--json'],
      240_000,
    )
    expectExit(result, 0)
    first = result.json
    expect(first).toMatchObject({
      v: 1,
      status: 'ok',
      state: 'on',
      session_id: expect.stringMatching(/^s_[0-9a-f]{12}$/),
      pid: expect.any(Number),
      cursor: expect.stringMatching(CURSOR),
      // Relative to the service directory: the session process holds the directory, so its
      // output has become session.log.
      log_file: '.serverless/dev/session.log',
      events_file: '.serverless/dev/session.ndjson',
    })
    expect(first.already_running).toBeFalsy()
    expect(first.functions).toEqual(
      expect.arrayContaining(
        devKeys.map((name) => expect.objectContaining({ name, mode: 'dev' })),
      ),
    )
    // The launcher has exited; the session process it started runs on.
    expect(isProcessAlive(first.pid)).toBe(true)
    expect(readSessionFile(fixture)).toMatchObject({
      v: 1,
      session_id: first.session_id,
      pid: first.pid,
      state: 'on',
      stage,
      region,
      detached: true,
      log_file: 'session.log',
    })
    expect(fs.existsSync(path.join(devDir(fixture), 'session.log'))).toBe(true)
    const tokenFile = path.join(devDir(fixture), 'control.token')
    const token = fs.readFileSync(tokenFile, 'utf8')
    // A boolean, so a failure never prints the token.
    expect(/^[0-9a-f]{64}$/.test(token)).toBe(true)
    if (process.platform !== 'win32') {
      expect(fs.statSync(tokenFile).mode & 0o777).toBe(0o600)
      expect(
        fs.statSync(path.join(devDir(fixture), 'session.json')).mode & 0o777,
      ).toBe(0o600)
    }
    controlTokens.push(token)
    attached.push(await attachedSecrets({ region, functionName: fn('api') }))
    // A new broker role can take a few minutes before the functions may use it.
    await waitForRelay({
      region,
      functionName: fn('api'),
      isThisMachine: ranHere,
    })
  })

  test('dev wait --for ready returns the ready record when the session is already on', async () => {
    const result = await cli(
      'dev wait --for ready',
      ['dev', 'wait', '--for', 'ready', '--json'],
      60_000,
    )
    expectExit(result, 0)
    expect(result.json).toMatchObject({
      v: 1,
      status: 'ok',
      event: expect.objectContaining({
        type: 'session.ready',
        session_id: first.session_id,
      }),
      cursor: `${first.session_id}:${result.json.event.seq}`,
    })
  })

  test('a TypeScript handler answers a real invocation from this machine, and dev wait --after finds its end', async () => {
    const status = await cli('dev status (before the TypeScript invocation)', [
      'dev',
      'status',
      '--json',
    ])
    expectExit(status, 0)
    const { functionError, body } = await sdkInvoke('api', { from: 'sdk' })
    expect(functionError).toBeUndefined()
    expect(body).toMatchObject({
      ran: 'this-machine',
      language: 'typescript',
      secretDigest: sha256(secrets['the function environment value']),
    })
    ids.typescript = body.requestId
    const end = await waitForEnd({
      name: 'dev wait (TypeScript)',
      functionKey: 'api',
      requestId: body.requestId,
      after: status.json.cursor,
    })
    expect(end).toMatchObject({
      v: 1,
      type: 'invocation.end',
      session_id: first.session_id,
      function: 'api',
      source: 'caller',
      outcome: 'ok',
      file: expect.any(String),
    })
    const record = readInvocationFile(end.file)
    expect(record).toMatchObject({
      v: 1,
      request_id: body.requestId,
      function: 'api',
      source: 'caller',
      outcome: 'ok',
    })
    expect(record.logs.lines.join('\n')).toContain(
      `agent-loop fixture handled ${body.requestId}`,
    )
  })

  withPython(
    'a Python handler answers a real invocation from this machine',
    async () => {
      // Its execution environment is new: the first invocations can run the deployed code.
      await waitForRelay({
        region,
        functionName: fn('python'),
        isThisMachine: ranHere,
        timeoutMs: 180_000,
      })
      const status = await cli('dev status (before the Python invocation)', [
        'dev',
        'status',
        '--json',
      ])
      expectExit(status, 0)
      const { functionError, body } = await sdkInvoke('python', {
        from: 'sdk',
      })
      expect(functionError).toBeUndefined()
      expect(body).toMatchObject({
        ran: 'this-machine',
        language: 'python',
        secretDigest: sha256(secrets['the function environment value']),
      })
      ids.python = body.requestId
      const end = await waitForEnd({
        name: 'dev wait (Python)',
        functionKey: 'python',
        requestId: body.requestId,
        after: status.json.cursor,
      })
      expect(readInvocationFile(end.file).logs.lines.join('\n')).toContain(
        'agent-loop fixture handled',
      )
    },
  )

  test('a function URL request is recorded with its credentials redacted', async () => {
    const { FunctionUrl } = await lambda.send(
      new GetFunctionUrlConfigCommand({ FunctionName: fn('api') }),
    )
    const status = await cli('dev status (before the function URL request)', [
      'dev',
      'status',
      '--json',
    ])
    expectExit(status, 0)
    const response = await fetch(new URL('orders', FunctionUrl), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secrets['the Authorization header value']}`,
        cookie: `session=${secrets['the cookie value']}`,
        'x-api-key': secrets['the x-api-key value'],
        'content-type': 'application/json',
      },
      body: JSON.stringify({ item: 'book' }),
    })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ ran: 'this-machine', sawAuthorization: true })
    ids.url = body.requestId
    const end = await waitForEnd({
      name: 'dev wait (function URL)',
      functionKey: 'api',
      requestId: body.requestId,
      after: status.json.cursor,
    })
    const { event, redacted } = readInvocationFile(end.file)
    // Booleans, so a failure never prints a header value.
    expect(event.headers.authorization === '[redacted]').toBe(true)
    expect(event.headers['x-api-key'] === '[redacted]').toBe(true)
    if ('cookie' in event.headers) {
      expect(event.headers.cookie === '[redacted]').toBe(true)
    }
    expect(
      (event.cookies ?? []).every((cookie) => cookie === '[redacted]'),
    ).toBe(true)
    expect(redacted).toEqual(
      expect.arrayContaining(['event.headers.authorization']),
    )
  })

  test('dev requests lists the recorded invocations, newest first', async () => {
    const all = await cli('dev requests', ['dev', 'requests', '--json'])
    expectExit(all, 0)
    const listed = all.json.requests.map((item) => item.request_id)
    expect(listed).toEqual(expect.arrayContaining(Object.values(ids)))
    const times = all.json.requests.map((item) => Date.parse(item.ts))
    expect(times).toEqual([...times].sort((a, b) => b - a))
    for (const item of all.json.requests) {
      expect(fs.existsSync(path.join(fixture, item.file))).toBe(true)
    }
    const one = await cli('dev requests --function api --limit 1', [
      'dev',
      'requests',
      '--function',
      'api',
      '--limit',
      '1',
      '--json',
    ])
    expectExit(one, 0)
    expect(one.json.requests).toEqual([
      expect.objectContaining({
        function: 'api',
        request_id: all.json.requests.find((item) => item.function === 'api')
          .request_id,
      }),
    ])
  })

  test('dev replay runs a recorded request again on this machine, from the event the session kept', async () => {
    const result = await cli(
      'dev replay',
      ['dev', 'replay', ids.url.slice(0, 8), '--json'],
      180_000,
    )
    expectExit(result, 0)
    expect(result.json).toMatchObject({
      v: 1,
      status: 'ok',
      replay_of: ids.url,
      function: 'api',
      outcome: 'ok',
    })
    expect(result.json.request_id).not.toBe(ids.url)
    // The raw event kept in memory, not the redacted file: no note.
    expect(result.json.note).toBeUndefined()
    const replayed = readInvocationFile(result.json.file)
    expect(replayed).toMatchObject({ v: 1, source: 'replay', function: 'api' })
    expect(replayed.event.headers.authorization === '[redacted]').toBe(true)
    // The handler saw the caller's real header: the replay ran the kept raw event.
    const { response } = result.json
    const answer =
      typeof response?.body === 'string' ? JSON.parse(response.body) : response
    expect(answer).toMatchObject({
      ran: 'this-machine',
      sawAuthorization: true,
    })
    ids.replay = result.json.request_id
  })

  test('dev status reports the session, its counts and its functions', async () => {
    const result = await cli('dev status', ['dev', 'status', '--json'])
    expectExit(result, 0)
    expect(result.json).toMatchObject({
      v: 1,
      status: 'ok',
      state: 'on',
      session_id: first.session_id,
      pid: first.pid,
      stage,
      region,
      detached: true,
      idle_timeout_s: 3600,
      cursor: expect.stringMatching(CURSOR),
      invocations: { total: expect.any(Number), errors: 0 },
      last_invocation: expect.objectContaining({
        request_id: expect.any(String),
      }),
    })
    expect(result.json.invocations.total).toBeGreaterThanOrEqual(
      Object.keys(ids).length,
    )
    expect(result.json.functions).toEqual(
      expect.arrayContaining(
        devKeys.map((name) => expect.objectContaining({ name, mode: 'dev' })),
      ),
    )
  })

  test('serverless invoke names the invocation file on stderr and keeps stdout as it was', async () => {
    const result = await cli('serverless invoke', [
      'invoke',
      '--function',
      'api',
      '--data',
      '{"from":"invoke"}',
    ])
    expectExit(result, 0)
    const payload = JSON.parse(result.stdout)
    expect(payload).toMatchObject({
      ran: 'this-machine',
      language: 'typescript',
    })
    const line = result.stderr.match(
      /Dev Mode: handled by your working copy · request ([0-9a-f]{8}) · (\S+\.json)/,
    )
    expect(line).not.toBeNull()
    expect(payload.requestId.startsWith(line[1])).toBe(true)
    expect(fs.existsSync(path.join(fixture, line[2]))).toBe(true)
    ids.invoke = payload.requestId
  })

  test('a second --detach returns the running session, and another selection is refused', async () => {
    const again = await cli(
      'dev --detach (again)',
      ['dev', '--detach', '--json'],
      120_000,
    )
    expectExit(again, 0)
    expect(again.json).toMatchObject({
      status: 'ok',
      already_running: true,
      session_id: first.session_id,
      pid: first.pid,
    })
    const other = await cli(
      'dev --detach --function api',
      ['dev', '--detach', '--function', 'api', '--json'],
      120_000,
    )
    expectExit(other, 1)
    expect(other.json).toMatchObject({
      status: 'error',
      reason: 'session_running',
    })
    expect(other.json.next).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ command: 'serverless dev stop' }),
      ]),
    )
    expect(other.stderr).toContain('Another Dev Mode session is running here')
    expect(readSessionFile(fixture).session_id).toBe(first.session_id)
  })

  test('after kill -9, --detach replaces the stale session and starts cleanly', async () => {
    process.kill(first.pid, 'SIGKILL')
    await waitForProcessExit(first.pid)
    // The killed session's handler processes notice their CLI is gone and exit (on Windows a
    // killed process's children outlive it briefly).
    await waitForNoHandlerProcesses(path.basename(fixture), 30_000)
    // AWS IoT Core reads a killed session as gone once its connection drops; until then Dev Mode
    // counts its functions as held, so the new session would leave them on the deployed code.
    expect(
      await waitForSessionGone({ region, sessionId: first.session_id }),
    ).toBe('gone')
    const result = await cli(
      'dev --detach (after kill -9)',
      ['dev', '--detach', '--json'],
      240_000,
    )
    expectExit(result, 0)
    second = result.json
    expect(second).toMatchObject({ status: 'ok', state: 'on' })
    expect(second.already_running).toBeFalsy()
    expect(second.session_id).not.toBe(first.session_id)
    expect(readSessionFile(fixture)).toMatchObject({
      session_id: second.session_id,
      pid: second.pid,
    })
    // The killed session's log was kept beside the new one.
    expect(
      fs.existsSync(
        path.join(devDir(fixture), `session.${first.session_id}.ndjson`),
      ),
    ).toBe(true)
    expect(second.functions).toEqual(
      expect.arrayContaining(
        devKeys.map((name) => expect.objectContaining({ name, mode: 'dev' })),
      ),
    )
    controlTokens.push(
      fs.readFileSync(path.join(devDir(fixture), 'control.token'), 'utf8'),
    )
    attached.push(await attachedSecrets({ region, functionName: fn('api') }))
    await waitForRelay({
      region,
      functionName: fn('api'),
      isThisMachine: ranHere,
      timeoutMs: 120_000,
    })
  })

  describe('dev stop and a double SIGTERM both restore', () => {
    test('dev stop ends the detached session, restores its functions and removes the session file', async () => {
      const result = await cli('dev stop', ['dev', 'stop', '--json'], 480_000)
      expectExit(result, 0)
      expect(result.json).toMatchObject({
        v: 1,
        status: 'ok',
        kept: false,
        exit_code: 0,
        cursor: expect.stringMatching(CURSOR),
        restore: expect.objectContaining({
          restored: devKeys.length,
          missing: 0,
          failed: 0,
        }),
      })
      await waitForProcessExit(second.pid, 60_000)
      expect(readSessionFile(fixture)).toBeNull()
      expect(fs.existsSync(path.join(devDir(fixture), 'control.token'))).toBe(
        false,
      )
      const records = readEventRecords(fixture)
      expect(records.map((record) => record.seq)).toEqual(
        records.map((_, index) => index + 1),
      )
      expect(
        records.filter((record) => record.type === 'session.stopping'),
      ).toEqual([expect.objectContaining({ trigger: 'stop_command' })])
      expect(records.at(-1)).toMatchObject({
        type: 'session.ended',
        session_id: second.session_id,
        exit_code: 0,
        kept: false,
      })
      await expectRestored()
      const off = await cli('dev status (after stop)', [
        'dev',
        'status',
        '--json',
      ])
      expectExit(off, 0)
      expect(off.json).toMatchObject({ status: 'ok', state: 'off' })
      // An agent that waited for the end afterwards gets the end that happened, with its code.
      const ended = await cli(
        'dev wait --for ended (after stop)',
        ['dev', 'wait', '--for', 'ended', '--json'],
        60_000,
      )
      expectExit(ended, 0)
      expect(ended.json).toMatchObject({
        status: 'ok',
        event: expect.objectContaining({
          type: 'session.ended',
          session_id: second.session_id,
        }),
        cursor: result.json.cursor,
      })
    })

    posixTest(
      'a double SIGTERM 3 ms apart during the restore is one stop',
      async () => {
        foreground = spawnSourceCli({
          args: ['dev', '--stage', stage, '--region', region],
          cwd: fixture,
          env: { SLS_DEV_TEST_SUFFIX: suffix },
        })
        await waitForOutput(foreground, /Dev Mode on/)
        // This session's secrets too: the last test searches for them.
        controlTokens.push(
          fs.readFileSync(path.join(devDir(fixture), 'control.token'), 'utf8'),
        )
        attached.push(
          await attachedSecrets({ region, functionName: fn('api') }),
        )
        // What an agent harness sends: two SIGTERMs, 3 ms apart. The spacing is the scenario,
        // not a wait for a condition.
        foreground.kill('SIGTERM')
        await sleep(3)
        foreground.kill('SIGTERM')
        const exit = await foreground.exited
        await foreground.closed
        outputs['foreground dev (stdout and stderr)'] = foreground.output
        expect(exit).toEqual({ code: 0, signal: null })
        expect(foreground.output).toMatch(/Dev Mode off/)
        expect(foreground.output).not.toMatch(/Left \d+ functions? in Dev Mode/)
        const records = readEventRecords(fixture)
        expect(
          records.filter((record) => record.type === 'session.stopping'),
        ).toEqual([expect.objectContaining({ trigger: 'signal' })])
        expect(records.at(-1)).toMatchObject({
          type: 'session.ended',
          exit_code: 0,
          restore: expect.objectContaining({ failed: 0 }),
        })
        await expectRestored()
      },
    )
  })

  test('nothing under .serverless/dev, and no output of the run, holds a secret', async () => {
    // Every attach was read while it held the function: a session key or an ExternalId missing
    // here would leave it out of the search below. Booleans, so a failure prints no value.
    expect(attached.length > 0).toBe(true)
    expect(
      attached.every(({ sessionKey, externalId }) =>
        Boolean(sessionKey && externalId),
      ),
    ).toBe(true)
    expect(controlTokens.length).toBe(attached.length)
    const { found, files } = findSecrets({
      dir: devDir(fixture),
      texts: outputs,
      secrets: {
        ...secrets,
        ...Object.fromEntries(
          controlTokens.map((token, index) => [
            `control token ${index + 1}`,
            token,
          ]),
        ),
        ...Object.fromEntries(
          attached.flatMap(({ sessionKey, externalId }, index) => [
            ...(sessionKey ? [[`session key ${index + 1}`, sessionKey]] : []),
            ...(externalId
              ? [[`broker ExternalId ${index + 1}`, externalId]]
              : []),
          ]),
        ),
      },
      patterns: {
        'a temporary AWS access key id': /\bASIA[0-9A-Z]{16}\b/,
      },
    })
    // session.json is gone; the logs, session.log and invocation files remain.
    expect(files).toBeGreaterThanOrEqual(4)
    expect(found).toEqual([])
  })
})
