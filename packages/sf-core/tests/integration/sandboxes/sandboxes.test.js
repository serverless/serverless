import path from 'path'
import url from 'url'
import { setGlobalRendererSettings } from '@serverless/util'
import {
  CloudFormationClient,
  DescribeStacksCommand,
  DescribeStackResourcesCommand,
} from '@aws-sdk/client-cloudformation'
import {
  IAMClient,
  GetRoleCommand,
  UpdateAssumeRolePolicyCommand,
} from '@aws-sdk/client-iam'
import {
  STSClient,
  GetCallerIdentityCommand,
  AssumeRoleCommand,
} from '@aws-sdk/client-sts'
import {
  LambdaMicrovmsClient,
  GetMicrovmImageCommand,
  GetMicrovmImageVersionCommand,
  RunMicrovmCommand,
  GetMicrovmCommand,
  CreateMicrovmAuthTokenCommand,
  TerminateMicrovmCommand,
} from '@aws-sdk/client-lambda-microvms'
import { jest } from '@jest/globals'
import { getTestStageName, runSfCore } from '../../utils/runSfCore'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

const REGION = 'us-east-1'
const SERVICE = 'sfc-sandboxes'

/**
 * Poll fn() until predicate(result) is true or maxMs elapsed.
 * Throws on timeout.
 */
async function pollUntil(
  fn,
  predicate,
  { intervalMs = 5000, maxMs = 300000, label = 'condition' } = {},
) {
  const deadline = Date.now() + maxMs
  let last
  while (Date.now() < deadline) {
    last = await fn()
    if (predicate(last)) return last
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error(
    `Timed out waiting for ${label}. Last value: ${JSON.stringify(last)}`,
  )
}

/**
 * Retry an async fn with exponential back-off.
 * Used for the MicroVM HTTP health-check during snapshot-restore window.
 */
async function fetchWithRetry(
  urlStr,
  options,
  { maxAttempts = 12, baseDelayMs = 5000 } = {},
) {
  let lastErr
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      const delay = baseDelayMs * Math.pow(1.5, attempt - 1)
      await new Promise((r) => setTimeout(r, delay))
    }
    try {
      const res = await fetch(urlStr, options)
      if (res.ok) return res
      lastErr = new Error(`HTTP ${res.status} from ${urlStr}`)
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr
}

describe('Serverless Framework Service - Sandboxes', () => {
  const configFileDirPath = path.join(__dirname, 'fixture')
  const configFilePath = path.join(configFileDirPath, 'serverless.yml')
  const stage = getTestStageName()
  const stackName = `${SERVICE}-${stage}`

  const cfnClient = new CloudFormationClient({ region: REGION })
  const iamClient = new IAMClient({ region: REGION })
  const stsClient = new STSClient({ region: REGION })
  const microvmsClient = new LambdaMicrovmsClient({ region: REGION })

  /**
   * Thin provider adapter for SandboxIamEmulation — maps provider.request(service, method, params)
   * to the corresponding AWS SDK v3 commands, and exposes the naming/region helpers the module
   * needs. Only the four service/method combinations used by SandboxIamEmulation are handled.
   */
  const provider = {
    getRegion: () => REGION,
    naming: {
      getStackName: () => stackName,
    },
    async request(service, method, params) {
      if (service === 'CloudFormation' && method === 'describeStacks') {
        const res = await cfnClient.send(new DescribeStacksCommand(params))
        return res
      }
      if (service === 'IAM' && method === 'getRole') {
        const res = await iamClient.send(new GetRoleCommand(params))
        return res
      }
      if (service === 'IAM' && method === 'updateAssumeRolePolicy') {
        await iamClient.send(new UpdateAssumeRolePolicyCommand(params))
        return {}
      }
      if (service === 'STS' && method === 'getCallerIdentity') {
        const res = await stsClient.send(new GetCallerIdentityCommand(params))
        return res
      }
      if (service === 'STS' && method === 'assumeRole') {
        const res = await stsClient.send(new AssumeRoleCommand(params))
        return res
      }
      throw new Error(`provider.request: unhandled ${service}.${method}`)
    },
  }

  const originalEnv = process.env

  beforeAll(async () => {
    setGlobalRendererSettings({
      isInteractive: false,
      logLevel: 'error',
    })
    process.env = {
      ...originalEnv,
      SERVERLESS_PLATFORM_STAGE: 'dev',
      SERVERLESS_LICENSE_KEY: process.env.SERVERLESS_LICENSE_KEY_DEV,
      SERVERLESS_ACCESS_KEY: undefined,
    }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  // ── 1. Deploy ──────────────────────────────────────────────────────────────

  test('Deploy', async () => {
    await runSfCore({
      coreParams: {
        options: { stage, c: configFilePath },
        command: ['deploy'],
      },
      jest,
    })
  })

  // ── 2. Validate resources ──────────────────────────────────────────────────

  test('Validate CFN stack and MicrovmImage resource', async () => {
    // 2a. Stack must be CREATE_COMPLETE
    const { Stacks } = await cfnClient.send(
      new DescribeStacksCommand({ StackName: stackName }),
    )
    expect(Stacks).toBeDefined()
    expect(Stacks.length).toBeGreaterThan(0)
    const stack = Stacks[0]
    expect(stack.StackStatus).toBe('CREATE_COMPLETE')

    // 2b. Image ARN must be present as a stack output
    const imageArnOutput = stack.Outputs?.find(
      (o) => o.OutputKey === 'EchoImageArn',
    )
    expect(imageArnOutput).toBeDefined()
    expect(imageArnOutput.OutputValue).toMatch(/^arn:aws:lambda/)

    // 2c. At least one AWS::Lambda::MicrovmImage resource must exist
    const { StackResources } = await cfnClient.send(
      new DescribeStackResourcesCommand({ StackName: stackName }),
    )
    const microvmImageResource = StackResources?.find(
      (r) => r.ResourceType === 'AWS::Lambda::MicrovmImage',
    )
    expect(microvmImageResource).toBeDefined()
    expect(microvmImageResource.ResourceStatus).toMatch(/COMPLETE$/)

    // 2d. GetMicrovmImage: state must be CREATED
    const imageArn = imageArnOutput.OutputValue
    const imageInfo = await microvmsClient.send(
      new GetMicrovmImageCommand({ imageIdentifier: imageArn }),
    )
    expect(imageInfo.state).toBe('CREATED')
    expect(imageInfo.latestActiveImageVersion).toBeDefined()

    // 2e. GetMicrovmImageVersion: resources[0].minimumMemoryInMiB === 2048, baseImageVersion set
    const versionInfo = await microvmsClient.send(
      new GetMicrovmImageVersionCommand({
        imageIdentifier: imageArn,
        imageVersion: imageInfo.latestActiveImageVersion,
      }),
    )
    expect(versionInfo.resources).toBeDefined()
    expect(versionInfo.resources.length).toBeGreaterThan(0)
    expect(versionInfo.resources[0].minimumMemoryInMiB).toBe(2048)
    expect(versionInfo.baseImageVersion).toBeDefined()
  })

  // ── 3. Observability ────────────────────────────────────────────────────────

  test('Observability: owned LogGroup (retention) + metric filter + dashboard; image built against owned group', async () => {
    const { StackResources } = await cfnClient.send(
      new DescribeStackResourcesCommand({ StackName: stackName }),
    )
    const byType = (t) => StackResources.filter((r) => r.ResourceType === t)
    const lg = byType('AWS::Logs::LogGroup')[0]
    expect(lg).toBeDefined()
    expect(lg.ResourceStatus).toMatch(/COMPLETE$/)
    expect(byType('AWS::Logs::MetricFilter').length).toBeGreaterThan(0)
    expect(byType('AWS::CloudWatch::Dashboard').length).toBe(1)
    // The MicrovmImage reached CREATE_COMPLETE earlier ⇒ the build succeeded
    // against the CFN-owned log group (the DependsOn approach works live).

    // Retention applied on the owned group:
    const { CloudWatchLogsClient, DescribeLogGroupsCommand } =
      await import('@aws-sdk/client-cloudwatch-logs')
    const logs = new CloudWatchLogsClient({ region: REGION })
    const groupName = `/aws/lambda-microvms/${SERVICE}-echo-${stage}`
    const { logGroups } = await logs.send(
      new DescribeLogGroupsCommand({ logGroupNamePrefix: groupName }),
    )
    const g = logGroups.find((x) => x.logGroupName === groupName)
    expect(g?.retentionInDays).toBe(7)
  })

  // ── 4. Invoke ──────────────────────────────────────────────────────────────

  test('Invoke: RunMicrovm → RUNNING → HTTP echo → TerminateMicrovm', async () => {
    // Retrieve stack outputs for image ARN and execution role ARN
    const { Stacks } = await cfnClient.send(
      new DescribeStacksCommand({ StackName: stackName }),
    )
    const stack = Stacks[0]

    const imageArn = stack.Outputs?.find(
      (o) => o.OutputKey === 'EchoImageArn',
    )?.OutputValue
    expect(imageArn).toBeDefined()

    // The execution role is not a stack output; read it from StackResources via GetAtt equivalent.
    // We look up the physical resource ID of EchoImageExecutionRole and derive its ARN from the
    // account/region embedded in the image ARN.
    const { StackResources } = await cfnClient.send(
      new DescribeStackResourcesCommand({ StackName: stackName }),
    )
    const execRoleResource = StackResources?.find(
      (r) => r.LogicalResourceId === 'EchoImageExecutionRole',
    )
    expect(execRoleResource).toBeDefined()
    // PhysicalResourceId for an IAM::Role is the role name; build the ARN
    const accountId = imageArn.split(':')[4]
    const execRoleArn = `arn:aws:iam::${accountId}:role/${execRoleResource.PhysicalResourceId}`

    let microvmId
    try {
      // 3a. RunMicrovm
      const runResp = await microvmsClient.send(
        new RunMicrovmCommand({
          imageIdentifier: imageArn,
          executionRoleArn: execRoleArn,
          idlePolicy: {
            maxIdleDurationSeconds: 900,
            suspendedDurationSeconds: 300,
            autoResumeEnabled: true,
          },
        }),
      )
      microvmId = runResp.microvmId
      expect(microvmId).toBeDefined()

      // 3b. Poll until RUNNING (up to 5 min)
      const microvmInfo = await pollUntil(
        () =>
          microvmsClient.send(
            new GetMicrovmCommand({ microvmIdentifier: microvmId }),
          ),
        (r) => r.state === 'RUNNING',
        { intervalMs: 10000, maxMs: 300000, label: 'MicroVM RUNNING' },
      )
      expect(microvmInfo.state).toBe('RUNNING')
      const endpoint = microvmInfo.endpoint
      expect(endpoint).toBeDefined()

      // 3c. CreateMicrovmAuthToken for port 8080
      const tokenResp = await microvmsClient.send(
        new CreateMicrovmAuthTokenCommand({
          microvmIdentifier: microvmId,
          expirationInMinutes: 30,
          allowedPorts: [{ port: 8080 }],
        }),
      )
      expect(tokenResp.authToken).toBeDefined()
      // authToken is a map keyed by HTTP header name. The proxy expects the
      // JWE under the `X-aws-proxy-auth` key passed verbatim as that header
      // (matches the live `--query 'authToken."X-aws-proxy-auth"'` contract).
      const token = tokenResp.authToken['X-aws-proxy-auth']
      expect(token).toBeDefined()

      // 3d. HTTP GET with retry/backoff (snapshot-restore window)
      const targetUrl = `https://${endpoint}/hello`
      const response = await fetchWithRetry(
        targetUrl,
        {
          headers: {
            'X-aws-proxy-auth': token,
            'X-aws-proxy-port': '8080',
          },
        },
        { maxAttempts: 12, baseDelayMs: 5000 },
      )
      expect(response.status).toBe(200)

      const body = await response.json()
      expect(body.path).toBe('/hello')
      expect(body.GREETING).toBe('hi')
    } finally {
      // 3e. Always terminate — idempotent per SDK docs
      if (microvmId) {
        try {
          await microvmsClient.send(
            new TerminateMicrovmCommand({ microvmIdentifier: microvmId }),
          )
          // Wait for the MicroVM to actually finish terminating before leaving
          // cleanup. TerminateMicrovm returns before the instance is gone, and a
          // MicroVM still referencing the image can otherwise race the later
          // `remove` test and intermittently block stack deletion.
          await pollUntil(
            () =>
              microvmsClient
                .send(new GetMicrovmCommand({ microvmIdentifier: microvmId }))
                .then((r) => r.state)
                .catch(() => 'TERMINATED'), // NotFound ⇒ already gone
            (state) => state === 'TERMINATED',
            { intervalMs: 5000, maxMs: 180000, label: 'MicroVM termination' },
          )
        } catch (err) {
          // Termination is best-effort in cleanup; log but don't rethrow
          console.error('TerminateMicrovm cleanup error:', err.message)
        }
      }
    }
  })

  // ── 5. invoke --sandbox ────────────────────────────────────────────────────

  test('invoke --sandbox returns the echo response', async () => {
    // The invoke command prints the HTTP response body via process.stdout.write
    // (raw CLI output), which runSfCore does not capture — capture it directly.
    const stdout = []
    const spy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk) => {
        stdout.push(String(chunk))
        return true
      })
    try {
      await runSfCore({
        coreParams: {
          options: { stage, c: configFilePath, sandbox: 'echo', path: '/hi' },
          command: ['invoke'],
        },
        jest,
      })
    } finally {
      spy.mockRestore()
    }
    const out = stdout.join('')
    expect(out).toMatch(/"path":\s*"\/hi"/)
    expect(out).toMatch(/"GREETING":\s*"hi"/)
  })

  // ── 6. logs --sandbox ──────────────────────────────────────────────────────

  test('logs --sandbox returns build/runtime lines', async () => {
    // logs prints lines via process.stdout.write (raw output) — capture it.
    const stdout = []
    const spy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk) => {
        stdout.push(String(chunk))
        return true
      })
    try {
      await runSfCore({
        coreParams: {
          options: { stage, c: configFilePath, sandbox: 'echo' },
          command: ['logs'],
        },
        jest,
      })
    } finally {
      spy.mockRestore()
    }
    expect(stdout.join('')).toMatch(/BOOT app|APP_REQUEST|#1 \[internal\]/)
  })

  // ── 7. IAM emulation ──────────────────────────────────────────────────────

  test('IAM emulation assumes the execution role and cleans up the trust policy', async () => {
    const { default: SandboxIamEmulation } =
      await import('@serverless/framework/lib/plugins/aws/sandboxes/dev/iam-emulation.js')
    const iam = new SandboxIamEmulation({
      provider,
      logger: { notice() {}, warning() {}, debug() {} },
    })

    const env = await iam.setUp('echo')
    expect(env).toBeTruthy()
    expect(env.AWS_SESSION_TOKEN).toBeTruthy()
    expect(env.AWS_ACCESS_KEY_ID).toMatch(/^A/)

    // The dev trust-policy statement must be present while emulation is active.
    const { Stacks } = await cfnClient.send(
      new DescribeStacksCommand({ StackName: stackName }),
    )
    const roleName = Stacks[0].Outputs.find(
      (o) => o.OutputKey === 'EchoImageExecutionRoleArn',
    )
      .OutputValue.split('/')
      .pop()

    const duringRes = await iamClient.send(
      new GetRoleCommand({ RoleName: roleName }),
    )
    const during = JSON.parse(
      decodeURIComponent(duringRes.Role.AssumeRolePolicyDocument),
    )
    expect(
      during.Statement.some(
        (s) => s.Sid === 'ServerlessSandboxesLocalDevPolicy',
      ),
    ).toBe(true)

    await iam.cleanUp()

    const afterRes = await iamClient.send(
      new GetRoleCommand({ RoleName: roleName }),
    )
    const after = JSON.parse(
      decodeURIComponent(afterRes.Role.AssumeRolePolicyDocument),
    )
    const stmt = after.Statement.find(
      (s) => s.Sid === 'ServerlessSandboxesLocalDevPolicy',
    )
    // cleanUp() added exactly one principal, so it takes the splice path and
    // removes the whole statement — assert that directly (not merely emptied).
    expect(stmt).toBeUndefined()
  }, 120000)

  // ── 8. Remove ──────────────────────────────────────────────────────────────

  test('Remove', async () => {
    await runSfCore({
      coreParams: {
        options: { stage, c: configFilePath },
        command: ['remove'],
      },
      jest,
    })

    // Assert stack no longer exists (or is DELETE_COMPLETE)
    try {
      const { Stacks } = await cfnClient.send(
        new DescribeStacksCommand({ StackName: stackName }),
      )
      // If it still exists, it must be DELETE_COMPLETE
      const stack = Stacks?.[0]
      expect(stack?.StackStatus).toBe('DELETE_COMPLETE')
    } catch (err) {
      // DescribeStacks throws ValidationError when the stack doesn't exist at all — that's fine
      if (
        err.name === 'ValidationError' &&
        err.message?.includes('does not exist')
      ) {
        return
      }
      throw err
    }
  })
})
