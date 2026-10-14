/**
 * Live: real invocations of attached functions, relayed through AWS IoT Core to `serverless dev`
 * on this machine and answered from here — a direct invoke, a Python handler, a response stream, a
 * function error, a result too large for one message, and the session killed mid-invocation.
 */
import path from 'path'
import url from 'url'
import { execFileSync } from 'child_process'
import { setTimeout as sleep } from 'timers/promises'
import { jest } from '@jest/globals'
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'
import { setGlobalRendererSettings } from '@serverless/util'
import { getTestStageName, runSfCore } from '../../utils/runSfCore.js'
import {
  assertDevModeLayersBuilt,
  cleanupDevModeAccountResources,
  deleteLogGroups,
  invokeStream,
  newDevModeTestSuffix,
  spawnSourceCli,
  sweepDevModePrefix,
  waitForOutput,
  waitForRelay,
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

describe('Dev Mode relays real invocations to this machine (live)', () => {
  const region = 'us-east-1'
  const fixture = path.join(__dirname, 'fixture-relay')
  const service = 'devmode-relay'
  const stage = getTestStageName()
  // Suffixes the account-level Dev Mode names (broker role, layers), so this suite deletes
  // exactly what it created.
  const suffix = newDevModeTestSuffix()
  const functionPrefix = `${service}-${stage}-`
  const fn = (key) => `${functionPrefix}${key}`
  const lambda = new LambdaClient({ region })
  const originalEnv = { ...process.env }
  let originalCwd
  let session
  // Set just before the deploy: when beforeAll fails earlier, there is no stack to remove and no
  // log group to sweep.
  let deployAttempted = false
  // Set once the deploy succeeded: only then can functions carry Dev Mode configuration.
  let deployed = false

  const sls = (command) =>
    runSfCore({ coreParams: { options: { stage, region }, command }, jest })
  const running = (child) =>
    Boolean(child) && child.exitCode === null && child.signalCode === null
  const ranHere = (body) => /"ran":\s?"this-machine"/.test(body)
  const invoke = async (key, event = {}) => {
    const out = await lambda.send(
      new InvokeCommand({
        FunctionName: fn(key),
        Payload: Buffer.from(JSON.stringify(event)),
      }),
    )
    const text = Buffer.from(out.Payload ?? []).toString()
    let body
    try {
      body = JSON.parse(text)
    } catch {
      body = undefined
    }
    return { functionError: out.FunctionError, text, body }
  }
  /** Waits for `pattern` in what the session printed after `from` characters of its output. */
  const waitForNewOutput = async (pattern, from, timeoutMs = 30_000) => {
    const until = Date.now() + timeoutMs
    while (!pattern.test(session.output.slice(from))) {
      if (Date.now() > until) {
        throw new Error(`timed out waiting for ${pattern}`)
      }
      await sleep(100)
    }
  }
  // Prints the session's output when an assertion about it fails, before teardown removes the
  // stage. The output carries no account id: the CLI prints none.
  const withOutput = async (check) => {
    try {
      await check()
    } catch (error) {
      console.error(session?.output)
      throw error
    }
  }

  beforeAll(async () => {
    // Captured before anything that can throw, so afterAll never restores an undefined cwd.
    originalCwd = process.cwd()
    // The layer zips are gitignored build artifacts; dev cannot attach without them.
    assertDevModeLayersBuilt()
    process.chdir(fixture)
    setGlobalRendererSettings({ isInteractive: false, logLevel: 'error' })
    // Mutated in place: child processes inherit the native environment, and a reassigned
    // process.env does not reliably reach it.
    process.env.SERVERLESS_PLATFORM_STAGE = 'dev'
    if (process.env.SERVERLESS_LICENSE_KEY_DEV) {
      process.env.SERVERLESS_LICENSE_KEY =
        process.env.SERVERLESS_LICENSE_KEY_DEV
    }
    delete process.env.SERVERLESS_ACCESS_KEY
    process.env.SLS_DEV_TEST_SUFFIX = suffix
    deployAttempted = true
    await sls(['deploy'])
    deployed = true
    session = spawnSourceCli({
      args: ['dev', '--stage', stage, '--region', region],
      cwd: fixture,
      env: { SLS_DEV_TEST_SUFFIX: suffix },
    })
    await waitForOutput(session, /Dev Mode on · 3 of 3 functions/)
    // A new broker role can take a few minutes before the functions may use it.
    await waitForRelay({
      region,
      functionName: fn('node'),
      isThisMachine: ranHere,
    })
  })

  afterAll(async () => {
    const failures = []
    // Ctrl+C restores the functions; SIGKILL if that takes too long.
    if (running(session)) {
      session.kill('SIGINT')
      const timer = setTimeout(() => session.kill('SIGKILL'), 120_000)
      await session.exited
      clearTimeout(timer)
    }
    if (deployed) {
      // The last test kills the session, which cannot restore its functions: restore them first.
      const restore = spawnSourceCli({
        args: ['dev', 'restore', '--stage', stage, '--region', region],
        cwd: fixture,
        env: { SLS_DEV_TEST_SUFFIX: suffix },
      })
      const { code } = await restore.exited
      await restore.closed
      if (code !== 0) {
        failures.push(`dev restore exited ${code}:\n${restore.output}`)
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
    // Restored before the environment: later test files in this worker must not resolve this
    // fixture.
    process.chdir(originalCwd)
    for (const key of Object.keys(process.env)) delete process.env[key]
    Object.assign(process.env, originalEnv)
    if (failures.length) {
      throw new Error(
        `Dev Mode relay suite teardown (stage ${stage}, suffix ${suffix}) failed:\n${failures.join('\n')}`,
      )
    }
  })

  test("a Node.js invocation runs here with the function's role and none of Dev Mode's variables", async () => {
    const from = session.output.length
    const { functionError, body } = await invoke('node')
    await withOutput(async () => {
      expect(functionError).toBeUndefined()
      // Masked before any assertion, so a failure never prints the account id into the log.
      body.callerArn = String(body.callerArn).replace(/\d{12}/g, '<acct>')
      expect(body).toMatchObject({
        ran: 'this-machine',
        devVariables: [],
        keyDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
      })
      // The function's role, assumed by Lambda for this function: not the developer's identity.
      expect(body.callerArn).toMatch(
        new RegExp(`^arn:aws:sts::<acct>:assumed-role/[^/]+/${fn('node')}$`),
      )
      await waitForNewOutput(/→.{0,12} λ node/, from)
      await waitForNewOutput(/←.{0,12} λ node/, from)
    })
  })

  const withPython = hasPython ? test : test.skip
  withPython('a Python invocation runs here', async () => {
    await waitForRelay({
      region,
      functionName: fn('python'),
      isThisMachine: ranHere,
      timeoutMs: 120_000,
    })
    const { functionError, body } = await invoke('python')
    await withOutput(async () => {
      expect(functionError).toBeUndefined()
      expect(body).toMatchObject({ ran: 'this-machine', devVariables: [] })
      // Null where this machine's Python has no boto3.
      if (body.callerArn !== null) {
        body.callerArn = String(body.callerArn).replace(/\d{12}/g, '<acct>')
        expect(body.callerArn).toMatch(
          new RegExp(
            `^arn:aws:sts::<acct>:assumed-role/[^/]+/${fn('python')}$`,
          ),
        )
      }
    })
  })

  test('a stream arrives in chunks, in order, with no error', async () => {
    // Its execution environment is new: the first invocations can run the deployed code.
    await waitForRelay({
      region,
      functionName: fn('stream'),
      isThisMachine: (body) => body.includes('this-machine'),
      timeoutMs: 120_000,
    })
    const { chunks, errorCode } = await invokeStream({
      region,
      functionName: fn('stream'),
      payload: { chunks: 10, gapMs: 200 },
    })
    await withOutput(async () => {
      expect(errorCode).toBeNull()
      // Every line exactly once, in order: the content, the order and the byte count.
      expect(chunks.map((chunk) => chunk.text).join('')).toBe(
        Array.from({ length: 10 }, (_, i) => `${i} this-machine\n`).join(''),
      )
      // Streamed, not buffered: the last line arrives at least 1.5 s after the first, as the
      // handler writes them 200 ms apart. The number of chunks is not asserted exactly: Lambda
      // may return two writes that reach it together as one PayloadChunk, and Dev Mode sends
      // writes less than 25 ms apart as one frame, so two lines can share a chunk.
      const lineTimes = chunks.flatMap((chunk) =>
        chunk.text
          .split('\n')
          .slice(0, -1)
          .map(() => chunk.atMs),
      )
      expect(lineTimes[9] - lineTimes[0]).toBeGreaterThanOrEqual(1_500)
      expect(chunks.length).toBeGreaterThanOrEqual(5)
    })
  })

  test('a function error reaches the caller with its type, and Caller received is shown', async () => {
    const from = session.output.length
    const { functionError, body } = await invoke('node', { throw: 'boom' })
    await withOutput(async () => {
      expect(functionError).toBe('Unhandled')
      expect(body).toMatchObject({ errorType: 'Error', errorMessage: 'boom' })
      await waitForNewOutput(/Caller received:/, from)
    })
  })

  test('a result above one message comes through S3', async () => {
    const { functionError, text, body } = await invoke('node', {
      bytes: 300_000,
    })
    await withOutput(async () => {
      expect(functionError).toBeUndefined()
      expect(body?.ran).toBe('this-machine')
      expect(text.length).toBeGreaterThan(300_000)
    })
  })

  // Last: it ends the session.
  test('the CLI killed mid-invocation: the caller gets Runtime.DevModeDisconnected, nothing runs twice', async () => {
    const from = session.output.length
    const started = Date.now()
    const inFlight = invoke('node', { sleepMs: 6_000 })
    await withOutput(() => waitForNewOutput(/→.{0,12} λ node/, from))
    session.kill('SIGKILL')
    await session.exited
    const { functionError, body } = await inFlight
    const tookMs = Date.now() - started
    await withOutput(async () => {
      expect(functionError).toBe('Unhandled')
      expect(body?.errorType).toBe('Runtime.DevModeDisconnected')
      expect(tookMs).toBeLessThan(15_000)
    })
    // The next invocation runs the deployed code at once. Even while the bridge still counts the
    // session as live, an offer nobody accepts only adds the acceptance window: no wait needed.
    const after = await invoke('node')
    expect(after.functionError).toBeUndefined()
    expect(after.body?.ran).toBe('deployed')
  })
})
