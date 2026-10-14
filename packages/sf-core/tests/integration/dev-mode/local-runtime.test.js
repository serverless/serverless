import fs from 'fs'
import path from 'path'
import url from 'url'
import { createHash } from 'crypto'
import { execFileSync } from 'child_process'
import { setTimeout as sleep } from 'timers/promises'
import { jest } from '@jest/globals'
import { GetFunctionCommand, LambdaClient } from '@aws-sdk/client-lambda'
import { setGlobalRendererSettings } from '@serverless/util'
import { getTestStageName, runSfCore } from '../../utils/runSfCore.js'
import {
  assertDevModeLayersBuilt,
  captureEnvironment,
  cleanupDevModeAccountResources,
  deleteLogGroups,
  feedInvocation,
  newDevModeTestSuffix,
  spawnSourceCli,
  sweepDevModePrefix,
  waitForOutput,
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

describe('Dev Mode runs handlers on this machine (live)', () => {
  const region = 'us-east-1'
  const fixture = path.join(__dirname, 'fixture-local-runtime')
  const stage = getTestStageName()
  // Suffixes the account-level Dev Mode names (broker role, layers), so this suite deletes
  // exactly what it created.
  const suffix = newDevModeTestSuffix()
  const functionPrefix = `devmode-lr-${stage}-`
  const fn = (key) => `${functionPrefix}${key}`
  const lambda = new LambdaClient({ region })
  const originalEnv = { ...process.env }
  const configs = {}
  // Held in memory only: these are real credentials of the deployed functions' roles.
  const environments = {}
  const digest = (value) =>
    createHash('sha256').update(String(value)).digest('hex')
  let originalCwd
  let session
  // Set just before the deploy: when beforeAll fails earlier, there is no stack to remove and no
  // log group to sweep.
  let deployAttempted = false

  const sls = (command) =>
    runSfCore({ coreParams: { options: { stage, region }, command }, jest })
  const running = (child) =>
    Boolean(child) && child.exitCode === null && child.signalCode === null
  // The captured environment as an attached function's bridge sends it: with Dev Mode's own
  // variables, which the handler on this machine must not see.
  const withDevModeNames = (environment) => ({
    ...environment,
    SLS_DEV_SESSION: 's_feed',
    SLS_DEV_OWNER: 'feed@test',
    SLS_DEV_SESSION_KEY: 'k'.repeat(44),
    AWS_LAMBDA_EXEC_WRAPPER: '/opt/sls-dev-wrapper',
  })
  const feed = (
    key,
    { event = {}, environmentId = `it-${key}`, environment } = {},
  ) =>
    feedInvocation({
      serviceDir: fixture,
      functionKey: key,
      functionArn: configs[key].FunctionArn,
      timeoutSeconds: configs[key].Timeout,
      environmentId,
      environment: environment ?? withDevModeNames(environments[key]),
      event,
    })
  // The processes the session started itself: its local workers. Not on Windows, which has no ps.
  const childPids = (pid) =>
    execFileSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8' })
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/).map(Number))
      .filter(([, ppid]) => ppid === pid)
      .map(([child]) => child)
  const alive = (pid) => {
    try {
      process.kill(pid, 0)
      return true
    } catch (error) {
      return error.code === 'EPERM'
    }
  }
  // Prints the session's output when an assertion about it fails, before teardown removes the
  // stage.
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
    for (const key of ['node', 'stream', 'python']) {
      configs[key] = (
        await lambda.send(new GetFunctionCommand({ FunctionName: fn(key) }))
      ).Configuration
    }
    // Read before the attach: once attached, the relay brings these invocations to this machine,
    // and the deployed code would no longer answer them.
    environments.node = await captureEnvironment({
      region,
      functionName: fn('node'),
    })
    environments.stream = await captureEnvironment({
      region,
      functionName: fn('stream'),
      streaming: true,
    })
    environments.python = await captureEnvironment({
      region,
      functionName: fn('python'),
    })
    session = spawnSourceCli({
      args: ['dev', '--stage', stage, '--region', region],
      cwd: fixture,
      env: { SLS_DEV_TEST_SUFFIX: suffix, SLS_DEV_TEST_FEED: '1' },
    })
    // All three functions run on a runtime Dev Mode supports, so all three attach.
    await waitForOutput(session, /Dev Mode on · 3 of 3 functions/)
  })

  afterAll(async () => {
    const failures = []
    // Ctrl+C restores the functions; SIGKILL if that takes too long (remove restores first).
    if (running(session)) {
      session.kill('SIGINT')
      const timer = setTimeout(() => session.kill('SIGKILL'), 120_000)
      await session.exited
      clearTimeout(timer)
    }
    if (deployAttempted) {
      // remove restores leftover Dev Mode configuration first, then deletes the stack.
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
      const objects = await sweepDevModePrefix({
        region,
        service: 'devmode-lr',
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
        `Dev Mode local runtime suite teardown (stage ${stage}, suffix ${suffix}) failed:\n${failures.join('\n')}`,
      )
    }
  })

  test("a Node.js handler runs with the deployed function's environment and role, not the developer's", async () => {
    const reply = await feed('node')
    await withOutput(async () => {
      expect(reply.kind).toBe('response')
      const body = JSON.parse(reply.text)
      // Masked before any assertion, so a failure never prints the account id into the log.
      body.callerArn = String(body.callerArn).replace(/\d{12}/g, '<acct>')
      expect(body).toMatchObject({
        invocations: 1,
        keyDigest: digest(environments.node.AWS_ACCESS_KEY_ID),
        greeting: 'deployed-greeting',
        tz: 'UTC',
        profile: null,
        devVariables: [],
        functionName: fn('node'),
      })
      expect(body.callerArn).toMatch(
        new RegExp(`^arn:aws:sts::<acct>:assumed-role/[^/]+/${fn('node')}$`),
      )
      expect(body.remainingMs).toBeGreaterThan(0)
      expect(body.remainingMs).toBeLessThanOrEqual(configs.node.Timeout * 1000)
      // The terminal lines follow the reply on their own schedule: wait for them.
      await waitForOutput(
        session,
        /λ node ── direct invoke · [0-9a-f]{8}/,
        30_000,
      )
      await waitForOutput(
        session,
        /λ node \(ok\) \d+(ms|\.\ds) · cold start \d+(ms|\.\ds) · [0-9a-f]{8}/,
        30_000,
      )
    })
  })

  test("an execution environment's worker stays warm, and another environment gets its own", async () => {
    await withOutput(async () => {
      expect(JSON.parse((await feed('node')).text).invocations).toBe(2)
      expect(
        JSON.parse((await feed('node', { environmentId: 'it-node-2' })).text)
          .invocations,
      ).toBe(1)
    })
  })

  test("a thrown error comes back as Lambda's error body, and the terminal shows it on the end line", async () => {
    const reply = await feed('node', {
      event: { fail: 'boom on this machine' },
    })
    await withOutput(async () => {
      expect(reply).toMatchObject({ kind: 'error', errorType: 'Error' })
      const error = JSON.parse(reply.text)
      expect(error.errorMessage).toBe('boom on this machine')
      expect(
        error.trace.some((line) => line.includes('/var/task/handler.mjs')),
      ).toBe(true)
      expect(error.trace.join('\n')).not.toContain(fixture)
      await waitForOutput(session, /✕ Error: boom on this machine/, 30_000)
      // The caller line is the last of the error block: once it is there, all of it is.
      await waitForOutput(
        session,
        /Caller received: the function error \(X-Amz-Function-Error: Unhandled\)/,
        30_000,
      )
      expect(session.output).toContain('↳ handler.mjs:')
    })
  })

  test('a streaming handler streams with its prelude, and an error mid-stream travels in the trailers', async () => {
    const ok = await feed('stream')
    const failed = await feed('stream', { event: { failMidStream: true } })
    await withOutput(async () => {
      expect(ok.kind).toBe('stream')
      expect(ok.contentType).toBe(
        'application/vnd.awslambda.http-integration-response',
      )
      expect(ok.chunks.length).toBeGreaterThanOrEqual(3)
      expect(
        ok.chunks[ok.chunks.length - 1].atMs - ok.chunks[0].atMs,
      ).toBeGreaterThanOrEqual(400)
      expect(ok.text).toContain('one\ntwo\nthree\n')
      expect(failed.kind).toBe('stream')
      expect(failed.trailers.errorType).toBe('Error')
    })
  })

  const withPython = hasPython ? test : test.skip
  withPython(
    "a Python handler runs with the deployed function's environment and role",
    async () => {
      const reply = await feed('python')
      await withOutput(async () => {
        expect(reply.kind).toBe('response')
        expect(JSON.parse(reply.text)).toMatchObject({
          invocations: 1,
          keyDigest: digest(environments.python.AWS_ACCESS_KEY_ID),
          greeting: 'deployed-greeting',
          tz: 'UTC',
          profile: null,
          functionName: fn('python'),
        })
      })
    },
  )

  test('Ctrl+C stops every local worker, removes the test feed, and restores the functions', async () => {
    const workers = process.platform === 'win32' ? [] : childPids(session.pid)
    session.kill('SIGINT')
    // Bounded like afterAll's stop: a restore that hangs fails here, not at the jest timeout.
    let bound
    const { code } = await Promise.race([
      session.exited,
      new Promise((resolve, reject) => {
        bound = setTimeout(
          () =>
            reject(
              new Error(
                `serverless dev did not exit within 2 minutes of Ctrl+C\n${session.output}`,
              ),
            ),
          120_000,
        )
      }),
    ]).finally(() => clearTimeout(bound))
    // 'exit' can come before the last output is read.
    await session.closed
    await withOutput(async () => {
      if (process.platform !== 'win32') {
        // One warm worker per execution environment fed above: it-node, it-node-2, it-stream and
        // it-python. A function error leaves its worker running (as it leaves a Lambda execution
        // environment), so the error tests add none and remove none.
        expect(workers.length).toBe(hasPython ? 4 : 3)
        for (let round = 0; round < 10 && workers.some(alive); round += 1) {
          await sleep(500)
        }
        expect(workers.filter(alive)).toEqual([])
      }
      expect(code).toBe(0)
      expect(session.output).toMatch(/Dev Mode off · 3 functions restored/)
      expect(
        fs.existsSync(
          path.join(fixture, '.serverless', 'dev', 'test-feed.json'),
        ),
      ).toBe(false)
      for (const key of ['node', 'stream', 'python']) {
        const { Configuration } = await lambda.send(
          new GetFunctionCommand({ FunctionName: fn(key) }),
        )
        expect(
          Object.keys(Configuration.Environment?.Variables ?? {}).filter(
            (name) => name.startsWith('SLS_DEV_'),
          ),
        ).toEqual([])
      }
    })
  })
})
