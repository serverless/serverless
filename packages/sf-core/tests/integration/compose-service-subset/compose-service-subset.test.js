import path from 'path'
import url from 'url'
import { setGlobalRendererSettings } from '@serverless/util'
import {
  CloudFormationClient,
  DescribeStacksCommand,
  DeleteStackCommand,
  waitUntilStackDeleteComplete,
} from '@aws-sdk/client-cloudformation'
import { jest } from '@jest/globals'
import { getTestStageName, runSfCore } from '../../utils/runSfCore.js'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

// Only a missing stack is an ignorable outcome for existence checks and
// teardown — anything else (credentials, throttling, DELETE_FAILED) must
// surface, or a real problem hides behind a silent catch.
const isStackMissingError = (err) =>
  err?.name === 'ValidationError' && /does not exist/.test(err?.message ?? '')

describe('Compose --service subset (exact-set semantics)', () => {
  const configFileDirPath = path.join(__dirname, 'fixture')
  const cloudformationClient = new CloudFormationClient({ region: 'us-east-1' })
  const originalEnv = { ...process.env }
  const originalArgv = [...process.argv]
  let originalCwd
  const stage = getTestStageName()
  // The fresh stage used by the teaching-message test below; hoisted so
  // teardown can clean up the api stack if that test's expected failure
  // ever regresses into a real deploy.
  const freshStage = `${stage}x`
  const stackName = (svc, atStage = stage) => `compose-subset-${svc}-${atStage}`

  const describeStack = async (svc) => {
    const res = await cloudformationClient.send(
      new DescribeStacksCommand({ StackName: stackName(svc) }),
    )
    return res.Stacks[0]
  }
  const stackExists = async (svc) => {
    try {
      await describeStack(svc)
      return true
    } catch (err) {
      if (isStackMissingError(err)) {
        return false
      }
      throw err
    }
  }

  beforeAll(async () => {
    originalCwd = process.cwd()
    process.chdir(configFileDirPath)
    setGlobalRendererSettings({ isInteractive: false, logLevel: 'error' })
    // Mutate process.env in place (reassigning it does not reliably propagate,
    // and `undefined` values stringify to "undefined").
    process.env.SERVERLESS_PLATFORM_STAGE = 'dev'
    if (process.env.SERVERLESS_LICENSE_KEY_DEV) {
      process.env.SERVERLESS_LICENSE_KEY =
        process.env.SERVERLESS_LICENSE_KEY_DEV
    }
    delete process.env.SERVERLESS_ACCESS_KEY
  })

  afterAll(async () => {
    // Restore cwd first: jest workers run several test files in one process,
    // so a leaked chdir makes later, unrelated test files resolve THIS
    // fixture's serverless-compose.yml from their runs.
    process.chdir(originalCwd)
    for (const key of Object.keys(process.env)) delete process.env[key]
    Object.assign(process.env, originalEnv)
    // Restore argv too — later test files in the same jest worker must not
    // inherit this suite's last process.argv[2] mutation.
    process.argv.splice(0, process.argv.length, ...originalArgv)
    // Belt-and-suspenders teardown: force-delete every stack this suite might
    // have created (including api at the teaching-test's fresh stage). Missing
    // stacks are fine; any other failure is reported after cleanup finishes.
    const stacks = [
      ...['api', 'middle', 'worker', 'db'].map((svc) => stackName(svc)),
      stackName('api', freshStage),
    ]
    const failures = []
    for (const name of stacks) {
      try {
        await cloudformationClient.send(
          new DeleteStackCommand({ StackName: name }),
        )
      } catch (err) {
        if (!isStackMissingError(err)) {
          failures.push(`delete ${name}: ${err.message}`)
        }
      }
    }
    for (const name of stacks) {
      try {
        await waitUntilStackDeleteComplete(
          { client: cloudformationClient, maxWaitTime: 300 },
          { StackName: name },
        )
      } catch (err) {
        if (!isStackMissingError(err)) {
          failures.push(`wait ${name}: ${err.message}`)
        }
      }
    }
    if (failures.length > 0) {
      throw new Error(`Teardown failed:\n${failures.join('\n')}`)
    }
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  // The fixture graph is api -> middle -> worker. `middle` is the unnamed,
  // param-consuming intermediate that references the named `worker`; `api`
  // references `middle`. `db` is unrelated. We deploy ONLY middle + worker up
  // front (NOT api), so the later `deploy --service=api,worker` deploys `api`
  // for the FIRST time — a genuine pass/fail signal for C1 (a false resolution
  // would leave no api stack at all, not a stale one).
  let middleStackBefore

  test('deploy --service=middle,worker deploys the intermediate + its dep (api,db untouched)', async () => {
    process.argv[2] = 'deploy'
    await runSfCore({
      coreParams: {
        options: { stage, service: 'middle,worker' },
        command: ['deploy'],
      },
      jest,
    })
    for (const svc of ['middle', 'worker']) {
      const stack = await describeStack(svc)
      expect(stack.StackStatus).toMatch(/^(CREATE|UPDATE)_COMPLETE$/)
    }
    // api and db were not part of the named set -> not deployed
    expect(await stackExists('api')).toBe(false)
    expect(await stackExists('db')).toBe(false)
    middleStackBefore = await describeStack('middle')
  }, 300000)

  // C1 core: `deploy --service=api,worker`. `api` is deployed for the first
  // time and resolves `${middle.PassedArn}` — where `middle` is UNNAMED and only
  // get-state'd, and middle itself references the NAMED `worker`. Before the fix,
  // worker was excluded from the get-state closure, so middle's `${worker.TopicArn}`
  // could not resolve during get-state, middle's state was never loaded, and api's
  // deploy failed (no api stack would exist). A COMPLETE api stack proves the fix.
  test('deploy --service=api,worker deploys api fresh through the get-state closure; middle untouched', async () => {
    process.argv[2] = 'deploy'
    await runSfCore({
      coreParams: {
        options: { stage, service: 'api,worker' },
        command: ['deploy'],
      },
      jest,
    })

    // api was created (would be absent if middle->worker had not resolved)
    const apiStack = await describeStack('api')
    expect(apiStack.StackStatus).toMatch(/^(CREATE|UPDATE)_COMPLETE$/)
    // worker still there
    const workerStack = await describeStack('worker')
    expect(workerStack.StackStatus).toMatch(/^(CREATE|UPDATE)_COMPLETE$/)
    // middle (unnamed) was neither redeployed nor changed: same stack, no update
    const middleStackAfter = await describeStack('middle')
    expect(middleStackAfter.StackId).toEqual(middleStackBefore.StackId)
    expect(middleStackAfter.LastUpdatedTime).toEqual(
      middleStackBefore.LastUpdatedTime,
    )
    // db still not deployed
    expect(await stackExists('db')).toBe(false)
  }, 300000)

  test('api resolved the compose param transitively from worker (api -> middle -> worker)', async () => {
    const stack = await describeStack('api')
    const stored = stack.Outputs.find(
      (o) => o.OutputKey === 'StoredValue',
    ).OutputValue
    expect(stored).toMatch(/^arn:aws:sns:/)
    expect(stored).toContain('compose-subset-worker')
  })

  test('deploy --service=api at a fresh stage fails with the teaching message (names middle)', async () => {
    process.argv[2] = 'deploy'
    await expect(
      runSfCore({
        coreParams: {
          options: { stage: freshStage, service: 'api' },
          command: ['deploy'],
        },
        jest,
        expectError: true,
      }),
    ).rejects.toThrow(
      new RegExp(`serverless deploy --service=middle --stage ${freshStage}`),
    )
  }, 120000)

  test('remove --service=api,worker removes exactly those two (middle stays)', async () => {
    process.argv[2] = 'remove'
    await runSfCore({
      coreParams: {
        options: { stage, service: 'api,worker' },
        command: ['remove'],
      },
      jest,
    })
    expect(await stackExists('api')).toBe(false)
    expect(await stackExists('worker')).toBe(false)
    // middle was not in the named set, so it is still deployed
    const middleStack = await describeStack('middle')
    expect(middleStack.StackStatus).toMatch(/^(CREATE|UPDATE)_COMPLETE$/)
  }, 300000)
})

// Regression: a fully-successful FIRST-RUN subset must exit 0. On a brand-new
// stage nothing is deployed, so the get-state pass over the dependency closure
// reads a not-yet-deployed stack. getServiceUniqueId throws "Stack ... does not
// exist" for that absent stack; before the fix that propagated into the per-node
// catch, which set process.exitCode = 1 and printed a bogus "✖ / 1 failed" even
// though the real run fully succeeded. `middle,worker` is self-contained (middle
// depends only on worker, worker has no deps), so the real run deploys both and
// succeeds — the only failure signal is the spurious exit code / report.
describe('Compose --service subset first run exits 0 (regression)', () => {
  const configFileDirPath = path.join(__dirname, 'fixture')
  const cloudformationClient = new CloudFormationClient({ region: 'us-east-1' })
  const originalEnv = { ...process.env }
  const originalArgv = [...process.argv]
  let originalCwd
  // Distinct fresh stage: nothing here is pre-deployed by the suite above.
  const stage = `${getTestStageName()}fr`
  const stackName = (svc) => `compose-subset-${svc}-${stage}`

  const stripAnsi = (s) =>
    // eslint-disable-next-line no-control-regex
    s.replace(/\[[0-9;]*m/g, '')

  beforeAll(async () => {
    originalCwd = process.cwd()
    process.chdir(configFileDirPath)
    setGlobalRendererSettings({ isInteractive: false, logLevel: 'error' })
    // Mutate process.env in place (see the suite above).
    process.env.SERVERLESS_PLATFORM_STAGE = 'dev'
    if (process.env.SERVERLESS_LICENSE_KEY_DEV) {
      process.env.SERVERLESS_LICENSE_KEY =
        process.env.SERVERLESS_LICENSE_KEY_DEV
    }
    delete process.env.SERVERLESS_ACCESS_KEY
  })

  afterAll(async () => {
    // Restore cwd + env in place (see the suite above).
    process.chdir(originalCwd)
    for (const key of Object.keys(process.env)) delete process.env[key]
    Object.assign(process.env, originalEnv)
    // Restore argv too — later test files in the same jest worker must not
    // inherit this suite's last process.argv[2] mutation.
    process.argv.splice(0, process.argv.length, ...originalArgv)
    // Missing stacks are fine; any other failure is reported after cleanup.
    const failures = []
    for (const svc of ['middle', 'worker']) {
      try {
        await cloudformationClient.send(
          new DeleteStackCommand({ StackName: stackName(svc) }),
        )
      } catch (err) {
        if (!isStackMissingError(err)) {
          failures.push(`delete ${stackName(svc)}: ${err.message}`)
        }
      }
    }
    for (const svc of ['middle', 'worker']) {
      try {
        await waitUntilStackDeleteComplete(
          { client: cloudformationClient, maxWaitTime: 300 },
          { StackName: stackName(svc) },
        )
      } catch (err) {
        if (!isStackMissingError(err)) {
          failures.push(`wait ${stackName(svc)}: ${err.message}`)
        }
      }
    }
    if (failures.length > 0) {
      throw new Error(`Teardown failed:\n${failures.join('\n')}`)
    }
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('deploy --service=middle,worker on a fresh stage succeeds cleanly (exit code 0, 0 failed)', async () => {
    process.argv[2] = 'deploy'

    let stderrOut = ''
    const stderrSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk) => {
        stderrOut += chunk.toString()
        return true
      })

    // Capture and neutralize process.exitCode around the run so the bug's
    // lingering exit code neither escapes into Jest nor false-passes here.
    const prevExitCode = process.exitCode
    process.exitCode = 0
    let observedExitCode
    try {
      await runSfCore({
        coreParams: {
          options: { stage, service: 'middle,worker' },
          command: ['deploy'],
        },
        jest,
      })
    } finally {
      observedExitCode = process.exitCode
      process.exitCode = prevExitCode
      stderrSpy.mockRestore()
    }

    const output = stripAnsi(stderrOut)

    // Primary signal: the run must exit cleanly (exact success code).
    expect(observedExitCode).toBe(0)
    // The report must show zero failures and no failure marker.
    expect(output).not.toContain('✖')
    expect(output).toContain('0 failed')

    // Sanity: both services were actually deployed by the real run.
    for (const svc of ['middle', 'worker']) {
      const res = await cloudformationClient.send(
        new DescribeStacksCommand({ StackName: stackName(svc) }),
      )
      expect(res.Stacks[0].StackStatus).toMatch(/^(CREATE|UPDATE)_COMPLETE$/)
    }
  }, 300000)
})
