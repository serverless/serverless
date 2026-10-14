import path from 'path'
import url from 'url'
import { setTimeout as delay } from 'timers/promises'
import { jest } from '@jest/globals'
import {
  GetFunctionCommand,
  InvokeCommand,
  LambdaClient,
} from '@aws-sdk/client-lambda'
import { setGlobalRendererSettings } from '@serverless/util'
import { getTestStageName, runSfCore } from '../../utils/runSfCore.js'
import {
  assertDevModeLayersBuilt,
  cleanupDevModeAccountResources,
  deleteLogGroups,
  newDevModeTestSuffix,
  readEventRecords,
  spawnSourceCli,
  sweepDevModePrefix,
  waitForOutput,
  withBridgeLogLines,
} from '../../utils/devMode.js'
import {
  LIVENESS,
  pingSession,
} from '../../../../serverless/lib/plugins/aws/dev/relay/liveness.js'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

jest.setTimeout(1_800_000)

describe('Dev Mode attach and restore (live)', () => {
  const region = 'us-east-1'
  const fixture = path.join(__dirname, 'fixture')
  const stage = getTestStageName()
  // Suffixes the account-level Dev Mode names (broker role, layers), so this suite deletes
  // exactly what it created.
  const suffix = newDevModeTestSuffix()
  const lambda = new LambdaClient({ region })
  const KEYS = ['node', 'python', 'ruby', 'optOut', 'chained']
  const functionPrefix = `devmode-it-${stage}-`
  const fn = (key) => `${functionPrefix}${key}`
  const originalEnv = { ...process.env }
  const children = []
  let originalCwd
  let before
  // Set just before the first deploy: when beforeAll fails earlier, there is no stack to remove
  // and no log group to sweep.
  let deployAttempted = false

  /**
   * What attach and restore change (the layers and the environment variables), and what they must
   * never change (timeout, handler, runtime and role).
   */
  const shape = async (key) => {
    const { Configuration } = await lambda.send(
      new GetFunctionCommand({ FunctionName: fn(key) }),
    )
    return {
      Layers: (Configuration.Layers ?? []).map((layer) => layer.Arn),
      Environment: Configuration.Environment?.Variables ?? {},
      Timeout: Configuration.Timeout,
      Handler: Configuration.Handler,
      Runtime: Configuration.Runtime,
      Role: Configuration.Role,
    }
  }
  const shapes = async () =>
    Object.fromEntries(
      await Promise.all(KEYS.map(async (key) => [key, await shape(key)])),
    )
  const invoke = async (key) => {
    const response = await lambda.send(
      new InvokeCommand({
        FunctionName: fn(key),
        Payload: Buffer.from('{}'),
      }),
    )
    const payload = Buffer.from(response.Payload).toString()
    expect({ key, error: response.FunctionError, payload }).toEqual({
      key,
      error: undefined,
      payload: expect.any(String),
    })
    return JSON.parse(payload)
  }
  // Long-running and signal-driven commands run as child processes over pipes.
  const cli = (args) => {
    const child = spawnSourceCli({
      args: [...args, '--stage', stage, '--region', region],
      cwd: fixture,
      env: { SLS_DEV_TEST_SUFFIX: suffix },
    })
    children.push(child)
    return child
  }
  // Every session leaves optOut on its deployed code, as a developer does for one run.
  const dev = (args = []) => cli(['dev', '--skip-function', 'optOut', ...args])
  const running = (child) =>
    child.exitCode === null && child.signalCode === null
  // Prints a child's output when an assertion about it fails, before teardown removes the stage.
  const withOutput = async (child, check) => {
    try {
      await check()
    } catch (error) {
      console.error(`=== serverless ${child.spawnargs.slice(2).join(' ')} ===`)
      console.error(child.output)
      throw error
    }
  }
  const sls = (command) =>
    runSfCore({ coreParams: { options: { stage, region }, command }, jest })

  // The Lambda Runtime API a handler sees: the bridge's in the deployed function, the session's
  // own (also on 127.0.0.1, on another port) when the invocation was relayed to this machine.
  const BRIDGE_RUNTIME_API = '127.0.0.1:9140'
  // The session's address carries its secret path: only its host is compared.
  const isLaptopRuntimeApi = (value) =>
    String(value).startsWith('127.0.0.1:') && value !== BRIDGE_RUNTIME_API
  /** Polls `check` until it returns a value, at most `ms`. */
  const pollUntil = async (check, { ms, every, what }) => {
    const until = Date.now() + ms
    for (;;) {
      const value = await check()
      if (value) return value
      if (Date.now() > until) throw new Error(`timed out waiting for ${what}`)
      await delay(every)
    }
  }
  /**
   * Invokes `key` until this machine answers: a new broker role can take a few minutes before
   * the functions may use it, and until then the deployed code answers. On timeout, the error
   * carries the bridge's last log lines.
   */
  const waitForRelay = async (key) => {
    const since = Date.now()
    try {
      return await pollUntil(
        async () => {
          const answer = await invoke(key)
          return answer.runtimeApi !== BRIDGE_RUNTIME_API && answer
        },
        { ms: 300_000, every: 5_000, what: `${key} to be relayed` },
      )
    } catch (error) {
      throw await withBridgeLogLines(error, {
        region,
        functionName: fn(key),
        since,
      })
    }
  }
  /** Waits until AWS IoT Core Direct Messaging finds no connected CLI for the session. */
  const waitForSessionGone = ({ sessionId, endpoint }) =>
    pollUntil(
      async () =>
        (await pingSession({ endpoint, region, sessionId })) === LIVENESS.GONE,
      { ms: 60_000, every: 500, what: `session ${sessionId} to be gone` },
    )

  /** Stops a session that is still running: Ctrl+C restores, SIGKILL if that takes too long. */
  const stop = async (child) => {
    if (!running(child)) return
    child.kill('SIGINT')
    const timer = setTimeout(() => child.kill('SIGKILL'), 120_000)
    await child.exited
    clearTimeout(timer)
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
    before = await shapes()
  })

  afterEach(async () => {
    // A failed test can leave a session running; stopping it restores its functions.
    await Promise.all(children.map(stop))
    jest.restoreAllMocks()
  })

  afterAll(async () => {
    for (const child of children) {
      if (running(child)) child.kill('SIGKILL')
    }
    const failures = []
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
      // A session killed mid-run never swept its payload objects.
      const objects = await sweepDevModePrefix({
        region,
        service: 'devmode-it',
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
    jest.restoreAllMocks()
    if (failures.length) {
      throw new Error(
        `Dev Mode suite teardown (stage ${stage}, suffix ${suffix}) failed:\n${failures.join('\n')}`,
      )
    }
  })

  test('attaches Node and Python, leaves the rest on their deployed code, and restores exactly on Ctrl+C', async () => {
    const child = dev()
    await waitForOutput(child, /Dev Mode on · 3 of 5 functions/)
    // The function table follows the ready line, then the hint.
    await waitForOutput(
      child,
      /Press Ctrl\+C to restore your functions and exit\./,
    )
    await withOutput(child, async () => {
      expect(child.output).toMatch(
        /ruby\s+deployed\s+Ruby runtime \(Dev Mode support planned\)/,
      )
      expect(child.output).toMatch(
        /optOut\s+deployed\s+not selected \(--skip-function\)/,
      )
      const now = await shapes()
      for (const key of ['node', 'python', 'chained']) {
        expect(now[key].Layers[0]).toMatch(
          new RegExp(`:layer:serverless-dev-(arm64|x86_64)-${suffix}:\\d+$`),
        )
        expect(now[key].Environment.AWS_LAMBDA_EXEC_WRAPPER).toBe(
          '/opt/sls-dev-wrapper',
        )
      }
      // The function's own exec wrapper is kept, and the Dev Mode wrapper runs it.
      expect(now.chained.Environment.SLS_DEV_ORIGINAL_EXEC_WRAPPER).toBe(
        '/var/task/chain-wrapper.sh',
      )
      expect(now.ruby).toEqual(before.ruby)
      expect(now.optOut).toEqual(before.optOut)
      // Invocations are relayed to this machine: its handlers answer, from the session's own
      // Runtime API, and the function's exec wrapper runs only in the deployed function.
      for (const key of ['node', 'python', 'chained']) {
        const answer = await waitForRelay(key)
        expect(isLaptopRuntimeApi(answer.runtimeApi)).toBe(true)
        if (key === 'chained') expect(answer.chained).toBe(null)
      }
      expect(child.output).toMatch(/← λ node/)
    })
    child.kill('SIGINT')
    const { code } = await child.exited
    await withOutput(child, async () => {
      expect(code).toBe(0)
      expect(child.output).toMatch(/Dev Mode off · 3 functions restored/)
      expect(await shapes()).toEqual(before)
    })
  })

  test('--approve without a terminal exits 1 and changes nothing', async () => {
    const child = dev(['--approve'])
    const { code } = await child.exited
    await withOutput(child, async () => {
      expect(code).toBe(1)
      expect(child.output).toContain('--approve needs')
      expect(child.output).toContain('Nothing was changed.')
      expect(child.output).not.toMatch(/Dev Mode on/)
      expect(await shapes()).toEqual(before)
    })
  })

  test('after a crash the functions keep running the deployed code, and dev restore puts them back', async () => {
    const child = dev()
    await waitForOutput(child, /Dev Mode on/)
    child.kill('SIGKILL')
    await child.exited
    expect((await shape('node')).Environment.SLS_DEV_SESSION).toBeDefined()
    // With no session connected, the bridge passes invocations through to the deployed code,
    // behind the function's own exec wrapper.
    expect(await invoke('node')).toMatchObject({
      marker: 'deployed',
      runtimeApi: BRIDGE_RUNTIME_API,
    })
    expect(await invoke('chained')).toMatchObject({
      runtimeApi: BRIDGE_RUNTIME_API,
      chained: 'yes',
    })
    const restore = cli(['dev', 'restore'])
    const { code } = await restore.exited
    await withOutput(restore, async () => {
      expect(code).toBe(0)
      expect(restore.output).toContain(
        `Functions with Dev Mode configuration on stage "${stage}":`,
      )
      expect(restore.output).toMatch(/Dev Mode off · 3 functions restored/)
      expect(await shapes()).toEqual(before)
    })
  })

  test('after a crash the next deploy restores first', async () => {
    const child = dev()
    await waitForOutput(child, /Dev Mode on/)
    child.kill('SIGKILL')
    await child.exited
    expect((await shape('node')).Environment.SLS_DEV_SESSION).toBeDefined()
    // --debug: the line for a session that may still run is a debug line.
    const deploy = cli(['deploy', '--debug'])
    const { code } = await deploy.exited
    await withOutput(deploy, async () => {
      expect(code).toBe(0)
      expect(deploy.output).toMatch(
        /Restored 3 functions from Dev Mode(?: \(.*\))?/,
      )
      expect(deploy.output).toContain(
        'If a "serverless dev" session is still running on this stage, it no longer has these functions: start it again after the deploy.',
      )
      expect(await shapes()).toEqual(before)
    })
  })

  test('a second Ctrl+C exits without waiting, and the next dev takes the leftovers back', async () => {
    const first = dev()
    await waitForOutput(first, /Dev Mode on/)
    const attachedTo = (await shape('node')).Environment
    first.kill('SIGINT')
    // The stop's spinner shows only in a terminal: its record says the stop began.
    const stopping = () =>
      readEventRecords(fixture).some(
        (record) =>
          record.type === 'session.stopping' &&
          record.session_id === attachedTo.SLS_DEV_SESSION,
      )
    for (let waited = 0; !stopping(); waited += 100) {
      if (waited > 60_000) throw new Error('no session.stopping record')
      await delay(100)
    }
    first.kill('SIGINT')
    const { code } = await first.exited
    // The second Ctrl+C races the restore: usually some functions are still attached (exit 3),
    // but the restore may already have finished (exit 0).
    await withOutput(first, async () => {
      if (code === 3) {
        expect(first.output).toMatch(/not restored: /i)
      } else {
        expect(code).toBe(0)
        expect(first.output).toMatch(/Dev Mode off · |Exiting\./)
      }
    })
    const leftovers = Object.values(await shapes()).filter(
      (s) => s.Environment.SLS_DEV_SESSION,
    ).length
    console.info(
      `second Ctrl+C: exit ${code}, ${leftovers} function(s) still attached`,
    )
    // The next session decides from AWS IoT Core whether the first one is still connected: the
    // process is gone, and AWS IoT Core notices that within moments.
    await waitForSessionGone({
      sessionId: attachedTo.SLS_DEV_SESSION,
      endpoint: attachedTo.SLS_DEV_IOT_ENDPOINT,
    })
    const second = dev()
    await waitForOutput(second, /Dev Mode on/)
    await withOutput(second, async () => {
      // Picking up its own earlier session's functions is a debug line; the mode records say it.
      const reattached = readEventRecords(fixture).filter(
        (record) =>
          record.type === 'function.mode' &&
          (record.notes ?? []).includes('reattached'),
      )
      if (leftovers) {
        // The count is not pinned: a restore the first session sent just before it exited can
        // land between the read above and the second session's own read.
        expect(reattached.length).toBeGreaterThan(0)
      } else {
        expect(reattached).toEqual([])
      }
    })
    second.kill('SIGINT')
    const exited = await second.exited
    await withOutput(second, async () => {
      expect(exited.code).toBe(0)
      expect(second.output).toMatch(/Dev Mode off · 3 functions restored/)
      expect(await shapes()).toEqual(before)
    })
  })

  test('stage prod is refused before anything changes', async () => {
    const child = spawnSourceCli({
      args: ['dev', '--stage', 'Prod', '--region', region],
      cwd: fixture,
      env: { SLS_DEV_TEST_SUFFIX: suffix },
    })
    children.push(child)
    const { code } = await child.exited
    await withOutput(child, async () => {
      expect(code).toBe(1)
      expect(child.output).toContain('Dev Mode does not run on stage "Prod"')
    })
  })
})
