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

const stripAnsi = (s) => s.replace(/\[[0-9;]*m/g, '')

// Live wiring for the service-provider Compose graph params (Tasks 1-6):
//   - `${service:worker.JobsQueueUrl}` — same-stage built-in provider, read
//     from this run's local state (zero fetches).
//   - `${shared:orders-db.TopicArn}` — a named service-typed instance pinned to
//     the `dev` stage (`stages.default.resolvers.shared`), so a personal-stage
//     `api` reads the shared `orders-db@dev` output WITHOUT deploying orders-db
//     at the personal stage.
// The end-to-end story: a full-graph deploy at the pinned `dev` stage bootstraps
// orders-db + worker before api (dependency-ordered), api's own stack outputs
// prove both refs resolved; a personal-stage `api,worker` subset resolves the
// SAME pinned dev topic ARN while orders-db never exists at the personal stage;
// `print` succeeds on a stage with nothing deployed, resolving each
// service-typed param from the last deployed state where one exists and
// rendering NOT_AVAILABLE_IN_PRINT_COMMAND where it does not.
//
// `orders-db` deliberately consumes a compose-file param
// (`${param:ordersDataSet}`) in its own serverless.yml: the pinned cross-stage
// read resolves that configuration at the pinned stage, so this fixture also
// covers the pinned read being handed the run's Compose params. With an empty
// param set the reference is unresolvable and the personal-stage subset run
// below aborts.
describe('Compose service-provider graph params (${service:...} + ${shared:...})', () => {
  const configFileDirPath = path.join(__dirname, 'fixture')
  const cloudformationClient = new CloudFormationClient({ region: 'us-east-1' })
  const originalEnv = { ...process.env }
  const originalArgv = [...process.argv]
  let originalCwd

  // The stage the fixture's `shared` instance is pinned to
  // (`stages.default.resolvers.shared.stage: ${param:dataStage}`, with
  // `dataStage: ${env:SVCPROVIDER_SHARED_STAGE, 'dev'}`) — the real named stage
  // this feature pins cross-stage reads to. Unique per run so concurrent runs
  // (two CI jobs, CI plus local) never deploy or tear down each other's
  // stacks. The param-driven `stage:` is resolved by the up-front
  // resolveConfigFile pass before the edge scan and dispatch resolution read it.
  const sharedStage = `${getTestStageName()}s`
  const personalStage = getTestStageName()
  // A fresh stage for the print scenario: nothing this suite deploys lives here.
  const printStage = `${getTestStageName()}p`

  const stackName = (svc, stage) => `svcprovider-${svc}-${stage}`

  const describeStack = async (svc, stage) => {
    const res = await cloudformationClient.send(
      new DescribeStacksCommand({ StackName: stackName(svc, stage) }),
    )
    return res.Stacks[0]
  }
  const stackExists = async (svc, stage) => {
    try {
      await describeStack(svc, stage)
      return true
    } catch (err) {
      if (isStackMissingError(err)) {
        return false
      }
      throw err
    }
  }
  const output = async (svc, stage, key) => {
    const stack = await describeStack(svc, stage)
    return stack.Outputs.find((o) => o.OutputKey === key)?.OutputValue
  }

  beforeAll(async () => {
    originalCwd = process.cwd()
    process.chdir(configFileDirPath)
    setGlobalRendererSettings({ isInteractive: false, logLevel: 'error' })
    // Mutate process.env in place (reassigning it does not reliably propagate,
    // and `undefined` values stringify to "undefined").
    process.env.SERVERLESS_PLATFORM_STAGE = 'dev'
    process.env.SVCPROVIDER_SHARED_STAGE = sharedStage
    if (process.env.SERVERLESS_LICENSE_KEY_DEV) {
      process.env.SERVERLESS_LICENSE_KEY =
        process.env.SERVERLESS_LICENSE_KEY_DEV
    }
    delete process.env.SERVERLESS_ACCESS_KEY
  })

  afterAll(async () => {
    // Restore cwd first: jest workers run several test files in one process, so
    // a leaked chdir makes later, unrelated test files resolve THIS fixture's
    // serverless-compose.yml from their runs.
    process.chdir(originalCwd)
    for (const key of Object.keys(process.env)) delete process.env[key]
    Object.assign(process.env, originalEnv)
    // Restore argv too — later test files in the same jest worker must not
    // inherit this suite's last process.argv[2] mutation.
    process.argv.splice(0, process.argv.length, ...originalArgv)

    // Belt-and-suspenders teardown: force-delete every stack this suite could
    // have created, even if the teardown test regressed mid-run. This does NOT
    // include orders-db@personalStage — that stack must never exist, and the
    // test itself asserts that. printStage deploys nothing.
    const targets = [
      ['orders-db', sharedStage],
      ['worker', sharedStage],
      ['api', sharedStage],
      ['worker', personalStage],
      ['api', personalStage],
    ]
    const failures = []
    for (const [svc, stage] of targets) {
      try {
        await cloudformationClient.send(
          new DeleteStackCommand({ StackName: stackName(svc, stage) }),
        )
      } catch (err) {
        if (!isStackMissingError(err)) {
          failures.push(`delete ${stackName(svc, stage)}: ${err.message}`)
        }
      }
    }
    for (const [svc, stage] of targets) {
      try {
        await waitUntilStackDeleteComplete(
          { client: cloudformationClient, maxWaitTime: 300 },
          { StackName: stackName(svc, stage) },
        )
      } catch (err) {
        if (!isStackMissingError(err)) {
          failures.push(`wait ${stackName(svc, stage)}: ${err.message}`)
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

  // Carried between scenarios: the shared orders-db@dev TopicArn that a
  // personal-stage api must pin in unchanged.
  let sharedTopicArn

  // Scenario 1: full-graph deploy at the shared/pinned stage. orders-db + worker
  // deploy before api (dependency-ordered edges); api's stack outputs prove BOTH
  // refs resolved. A fresh stage means a false resolution would leave no api
  // stack at all — a COMPLETE api stack with resolved outputs is the pass signal.
  test('full-graph deploy at the shared stage resolves both refs in api outputs', async () => {
    process.argv[2] = 'deploy'
    await runSfCore({
      coreParams: { options: { stage: sharedStage }, command: ['deploy'] },
      jest,
    })

    for (const svc of ['orders-db', 'worker', 'api']) {
      const stack = await describeStack(svc, sharedStage)
      expect(stack.StackStatus).toMatch(/^(CREATE|UPDATE)_COMPLETE$/)
    }

    sharedTopicArn = await output('api', sharedStage, 'ResolvedOrdersTopicArn')
    const jobsQueueUrl = await output(
      'api',
      sharedStage,
      'ResolvedJobsQueueUrl',
    )
    // ${shared:orders-db.TopicArn} -> a real SNS topic ARN.
    expect(sharedTopicArn).toMatch(/^arn:aws:sns:/)
    expect(sharedTopicArn).toContain('svcprovider-orders-db')
    // ${service:worker.JobsQueueUrl} -> a real SQS queue URL at THIS stage.
    // Anchored hostname: `sqs.<region>.amazonaws.com/<account id>/…`, so
    // `amazonaws.com` cannot match anywhere else in the URL.
    expect(jobsQueueUrl).toMatch(
      /^https:\/\/sqs\.[a-z0-9-]+\.amazonaws\.com\/\d{12}\//,
    )
    expect(jobsQueueUrl).toContain(`svcprovider-worker-${sharedStage}`)
    // orders-db's own `${param:ordersDataSet}` resolved from the compose file on
    // the normal dispatch path — the control for the pinned read below.
    expect(await output('orders-db', sharedStage, 'ResolvedDataSet')).toBe(
      'orders',
    )
  }, 600000)

  // Scenario 2: personal-stage subset. `api,worker` deploys worker@personal and
  // api@personal; api reads worker@personal (same-stage, local state) and the
  // pinned orders-db@dev TopicArn (cross-stage, read-only). orders-db is NOT in
  // the named set and, being pinned to a different stage, carries no deploy edge
  // — so it must not exist at the personal stage.
  //
  // This is the run that exercises the pinned cross-stage read: it resolves
  // orders-db's own serverless.yml at the `dev` stage, including its
  // `${param:ordersDataSet}`, so the run only completes if that read receives
  // the Compose params.
  test('personal-stage api,worker pins the dev topic ARN without deploying orders-db there', async () => {
    process.argv[2] = 'deploy'
    await runSfCore({
      coreParams: {
        options: { stage: personalStage, service: 'api,worker' },
        command: ['deploy'],
      },
      jest,
    })

    for (const svc of ['worker', 'api']) {
      const stack = await describeStack(svc, personalStage)
      expect(stack.StackStatus).toMatch(/^(CREATE|UPDATE)_COMPLETE$/)
    }

    const personalTopicArn = await output(
      'api',
      personalStage,
      'ResolvedOrdersTopicArn',
    )
    const personalJobsQueueUrl = await output(
      'api',
      personalStage,
      'ResolvedJobsQueueUrl',
    )
    // The SAME shared orders-db@dev ARN was pinned in — not a personal-stage one.
    expect(personalTopicArn).toMatch(/^arn:aws:sns:/)
    expect(personalTopicArn).toEqual(sharedTopicArn)
    // The same-stage worker ref resolved to the PERSONAL-stage queue.
    expect(personalJobsQueueUrl).toContain(
      `svcprovider-worker-${personalStage}`,
    )
    // orders-db must never have been deployed at the personal stage.
    expect(await stackExists('orders-db', personalStage)).toBe(false)
  }, 600000)

  // Scenario 3: print on a stage with nothing deployed AT THAT STAGE. print is
  // not short-circuited — it resolves service-typed params for real from the
  // state of the last deployment and only falls back to the
  // NOT_AVAILABLE_IN_PRINT_COMMAND sentinel per reference when the value cannot
  // be resolved. So this run exercises BOTH halves of the matrix at once:
  //   - `${shared:orders-db.TopicArn}` is pinned to `dev`, which Scenario 1
  //     deployed → the REAL dev topic ARN is rendered.
  //   - `${service:worker.JobsQueueUrl}` reads the run stage (printStage), where
  //     worker was never deployed → the sentinel is rendered.
  // print still never fails on an unresolvable reference, and deploys nothing.
  test('print resolves the pinned reference for real and sentinels the undeployed one', async () => {
    process.argv[2] = 'print'

    let out = ''
    const stdoutSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk) => {
        out += chunk.toString()
        return true
      })
    const stderrSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk) => {
        out += chunk.toString()
        return true
      })

    try {
      await runSfCore({
        coreParams: { options: { stage: printStage }, command: ['print'] },
        jest,
      })
    } finally {
      stdoutSpy.mockRestore()
      stderrSpy.mockRestore()
    }

    const rendered = stripAnsi(out)
    // The same-stage worker reference has no state at this fresh stage → sentinel.
    expect(rendered).toContain('NOT_AVAILABLE_IN_PRINT_COMMAND')
    // The pinned dev reference DOES have state → print renders the real value
    // (this is the behavior change: print resolves instead of short-circuiting).
    expect(rendered).toContain(sharedTopicArn)
    // print deployed nothing at this fresh stage.
    expect(await stackExists('api', printStage)).toBe(false)
  }, 300000)

  // Scenario 4: self-cleaning teardown — remove the personal subset first, then
  // the shared full graph. No svcprovider* stack from this suite should remain.
  test('teardown removes the personal subset then the shared graph', async () => {
    process.argv[2] = 'remove'
    await runSfCore({
      coreParams: {
        options: { stage: personalStage, service: 'api,worker' },
        command: ['remove'],
      },
      jest,
    })
    await runSfCore({
      coreParams: { options: { stage: sharedStage }, command: ['remove'] },
      jest,
    })

    expect(await stackExists('api', personalStage)).toBe(false)
    expect(await stackExists('worker', personalStage)).toBe(false)
    expect(await stackExists('api', sharedStage)).toBe(false)
    expect(await stackExists('worker', sharedStage)).toBe(false)
    expect(await stackExists('orders-db', sharedStage)).toBe(false)
  }, 600000)
})
