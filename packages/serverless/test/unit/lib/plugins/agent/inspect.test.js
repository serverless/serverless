import { describe, test, expect, jest, beforeEach } from '@jest/globals'

// The `agent inspect` command plugin (Task 6) is the integration keystone: it
// wires discover-resources (Task 5), select (Task 4), build-clients (Task 3),
// and run-calls (Task 2) into the CLI command. These tests mock the provider
// (getCredentials/request/getRegion/getStage/naming.getStackName) and the
// invoker factory (build-clients.createInvoker) so the plugin's own logic --
// index vs expand routing, envelope shape, deterministic ordering, fatal-error
// -> JSON-on-stdout, credential shaping, exit-code contract -- is exercised
// against the REAL registry + REAL select + REAL runMany, with only the AWS
// boundary (SDK sends) faked.
//
// See test/unit/lib/plugins/agent/build-clients.test.js for the
// jest.unstable_mockModule idiom this reuses.

// --- Mock the SDK boundary: writeText (stdout) + createInvoker (AWS calls) ---

const mockWriteText = jest.fn()
const mockLog = {
  get: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    notice: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
  })),
  notice: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
}

jest.unstable_mockModule('@serverless/util', () => ({
  writeText: mockWriteText,
  log: mockLog,
}))

// createInvoker is replaced with a factory returning a fake invoke() whose
// behavior each test controls, so runMany runs against the real registry but
// never touches AWS.
let fakeInvoke
const mockCreateInvoker = jest.fn(() => ({
  invoke: (...args) => fakeInvoke(...args),
  getClient: jest.fn(),
}))

jest.unstable_mockModule(
  '../../../../../lib/plugins/agent/lib/build-clients.js',
  () => ({
    createInvoker: mockCreateInvoker,
  }),
)

const { default: AgentInspect } =
  await import('../../../../../lib/plugins/agent/inspect.js')

// --- Harness -------------------------------------------------------------

function buildHarness({
  providerName = 'aws',
  stackResources = [],
  region = 'us-east-1',
  stage = 'dev',
  serviceName = 'orders-api',
  stackName = 'orders-api-dev',
  credentials = {
    accessKeyId: 'AKIAEXAMPLE',
    secretAccessKey: 'secret',
    sessionToken: 'token',
    accountId: '123456789012',
    callerArn: 'arn:aws:iam::123456789012:user/x',
  },
  requestImpl,
} = {}) {
  // Default paginated listStackResources: one page.
  const defaultRequest = jest.fn(async (service, method) => {
    if (service === 'CloudFormation' && method === 'listStackResources') {
      return { StackResourceSummaries: stackResources }
    }
    throw new Error(`unexpected provider.request(${service}, ${method})`)
  })

  const provider = {
    getCredentials: jest.fn(async () => credentials),
    getRegion: jest.fn(() => region),
    getStage: jest.fn(() => stage),
    request: requestImpl || defaultRequest,
    naming: { getStackName: jest.fn(() => stackName) },
  }

  const serverless = {
    service: {
      service: serviceName,
      provider: { name: providerName },
    },
    getProvider: jest.fn(() => provider),
  }

  return { serverless, provider }
}

function lastPayload() {
  // In JSON mode exactly one writeText carrying one JSON document is expected.
  expect(mockWriteText).toHaveBeenCalledTimes(1)
  return JSON.parse(mockWriteText.mock.calls[0][0])
}

const LAMBDA_SUMMARY = {
  LogicalResourceId: 'CreateOrderLambdaFunction',
  PhysicalResourceId: 'orders-api-dev-createOrder',
  ResourceType: 'AWS::Lambda::Function',
  ResourceStatus: 'UPDATE_COMPLETE',
}
const ROLE_SUMMARY = {
  LogicalResourceId: 'IamRoleLambdaExecution',
  PhysicalResourceId: 'orders-api-dev-lambdaRole',
  ResourceType: 'AWS::IAM::Role',
  ResourceStatus: 'CREATE_COMPLETE',
}
const BUCKET_SUMMARY = {
  LogicalResourceId: 'AssetsBucket',
  PhysicalResourceId: 'orders-api-dev-assets',
  ResourceType: 'AWS::S3::Bucket',
  ResourceStatus: 'CREATE_COMPLETE',
}
// A folded sub-resource (Lambda permission) -- lands in `other`, never
// independently describable.
const PERMISSION_SUMMARY = {
  LogicalResourceId: 'CreateOrderLambdaPermission',
  PhysicalResourceId: 'orders-api-dev-createOrder-perm',
  ResourceType: 'AWS::Lambda::Permission',
  ResourceStatus: 'CREATE_COMPLETE',
}

beforeEach(() => {
  mockWriteText.mockClear()
  mockCreateInvoker.mockClear()
  fakeInvoke = jest.fn(async () => ({ $metadata: {} }))
})

describe('AgentInspect command declaration', () => {
  test('declares an `agent` container command with `inspect` entrypoint + a single lifecycle event bound to the handler', () => {
    const { serverless } = buildHarness()
    const instance = new AgentInspect(serverless, {})

    expect(instance.commands.agent).toBeDefined()
    expect(instance.commands.agent.type).toBe('container')
    const inspectCmd = instance.commands.agent.commands.inspect
    expect(inspectCmd).toBeDefined()
    expect(Array.isArray(inspectCmd.lifecycleEvents)).toBe(true)
    expect(inspectCmd.lifecycleEvents).toHaveLength(1)

    const event = `agent:inspect:${inspectCmd.lifecycleEvents[0]}`
    expect(instance.hooks[event]).toBeDefined()
  })

  test('declares category booleans, aws-services, repeatable --name, and format options', () => {
    const { serverless } = buildHarness()
    const instance = new AgentInspect(serverless, {})
    const opts = instance.commands.agent.commands.inspect.options

    for (const cat of [
      'functions',
      'api',
      'events',
      'iam',
      'storage',
      'observability',
      'cdn',
      'identity',
      'iot',
      'sandboxes',
      'all',
    ]) {
      expect(opts[cat].type).toBe('boolean')
    }
    expect(opts['aws-services'].type).toBe('string')
    expect(opts.name.type).toBe('string')
    expect(opts.name.array).toBe(true)
    expect(opts.format.type).toBe('string')
  })
})

describe('index mode (no selection)', () => {
  test('emits the index envelope with mode:index, a hint, and groupByCategory-shaped resources', async () => {
    const { serverless } = buildHarness({
      stackResources: [LAMBDA_SUMMARY, ROLE_SUMMARY, PERMISSION_SUMMARY],
    })
    const instance = new AgentInspect(serverless, {})
    await instance.inspect()

    const payload = lastPayload()
    expect(payload.service).toBe('orders-api')
    expect(payload.stage).toBe('dev')
    expect(payload.region).toBe('us-east-1')
    expect(payload.stackName).toBe('orders-api-dev')
    expect(payload.mode).toBe('index')
    expect(typeof payload.hint).toBe('string')
    expect(payload.hint).toContain('--functions')
    expect(payload.hint).toContain('--aws-services')
    expect(payload.hint).toContain('--all')
    expect(payload.hint).toContain('--name')

    // groupByCategory shape: stable keys, functions has the lambda, iam the
    // role, the folded permission lands in `other`.
    expect(payload.resources.functions.map((r) => r.logicalId)).toEqual([
      'CreateOrderLambdaFunction',
    ])
    expect(payload.resources.iam.map((r) => r.logicalId)).toEqual([
      'IamRoleLambdaExecution',
    ])
    expect(payload.resources.other.map((r) => r.logicalId)).toEqual([
      'CreateOrderLambdaPermission',
    ])
    // No AWS describe calls in index mode.
    expect(mockCreateInvoker).not.toHaveBeenCalled()
    expect(fakeInvoke).not.toHaveBeenCalled()
  })

  test('index mode never constructs an invoker or calls getCredentials', async () => {
    const { serverless, provider } = buildHarness({
      stackResources: [LAMBDA_SUMMARY],
    })
    const instance = new AgentInspect(serverless, {})
    await instance.inspect()
    expect(provider.getCredentials).not.toHaveBeenCalled()
    expect(mockCreateInvoker).not.toHaveBeenCalled()
  })
})

describe('expand mode', () => {
  test('--functions describes the function (sub-resource NOT described) and shapes credentials flat->nested', async () => {
    const { serverless, provider } = buildHarness({
      stackResources: [LAMBDA_SUMMARY, PERMISSION_SUMMARY],
    })
    // Return a minimal successful response for every lambda call.
    fakeInvoke = jest.fn(async (awsService, method) => {
      return {
        $metadata: {},
        FunctionName: 'orders-api-dev-createOrder',
        method,
      }
    })

    const instance = new AgentInspect(serverless, { functions: true })
    await instance.inspect()

    const payload = lastPayload()
    // No mode field in expand mode.
    expect(payload.mode).toBeUndefined()
    expect(payload.resources.functions.CreateOrderLambdaFunction).toBeDefined()
    // The folded permission was never expanded.
    expect(payload.resources.other).toBeUndefined()
    expect(fakeInvoke).toHaveBeenCalled()
    // Every invoke targeted lambda.
    for (const call of fakeInvoke.mock.calls) {
      expect(call[0]).toBe('lambda')
    }

    // Credentials handed to createInvoker are shaped nested + stripped of
    // accountId/callerArn.
    expect(provider.getCredentials).toHaveBeenCalled()
    const invokerArgs = mockCreateInvoker.mock.calls[0][0]
    expect(invokerArgs.region).toBe('us-east-1')
    expect(invokerArgs.credentials).toEqual({
      accessKeyId: 'AKIAEXAMPLE',
      secretAccessKey: 'secret',
      sessionToken: 'token',
    })
    expect(invokerArgs.credentials.accountId).toBeUndefined()
    expect(invokerArgs.credentials.callerArn).toBeUndefined()
  })

  test('--aws-services selects by service token', async () => {
    const { serverless } = buildHarness({
      stackResources: [LAMBDA_SUMMARY, ROLE_SUMMARY],
    })
    fakeInvoke = jest.fn(async () => ({ $metadata: {}, ok: true }))
    const instance = new AgentInspect(serverless, { 'aws-services': 'iam' })
    await instance.inspect()

    const payload = lastPayload()
    expect(payload.resources.iam.IamRoleLambdaExecution).toBeDefined()
    expect(payload.resources.functions).toBeUndefined()
  })

  test('--name (alone) auto-selects the named resource', async () => {
    const { serverless } = buildHarness({
      stackResources: [LAMBDA_SUMMARY, ROLE_SUMMARY],
    })
    fakeInvoke = jest.fn(async () => ({ $metadata: {}, ok: true }))
    const instance = new AgentInspect(serverless, {
      name: ['IamRoleLambdaExecution'],
    })
    await instance.inspect()

    const payload = lastPayload()
    expect(payload.resources.iam.IamRoleLambdaExecution).toBeDefined()
    expect(payload.resources.functions).toBeUndefined()
  })

  test('--format yaml renders a single YAML document', async () => {
    const { serverless } = buildHarness({ stackResources: [LAMBDA_SUMMARY] })
    const instance = new AgentInspect(serverless, { format: 'yaml' })
    await instance.inspect()

    expect(mockWriteText).toHaveBeenCalledTimes(1)
    const out = mockWriteText.mock.calls[0][0]
    // YAML, not JSON: index envelope keys appear as `key:` lines.
    expect(out).toMatch(/mode: index/)
    expect(() => JSON.parse(out)).toThrow()
  })

  test('per-resource describe failure is captured as {error} but the run still succeeds (exit 0)', async () => {
    const { serverless } = buildHarness({ stackResources: [LAMBDA_SUMMARY] })
    // Reject the first (non-optional) lambda call so runResource captures it.
    fakeInvoke = jest.fn(async () => {
      const err = new Error('boom')
      err.$metadata = { httpStatusCode: 403 }
      err.name = 'AccessDeniedException'
      throw err
    })
    const instance = new AgentInspect(serverless, { functions: true })
    // Must NOT throw -- partial data is a successful inspect.
    await expect(instance.inspect()).resolves.toBeUndefined()

    const payload = lastPayload()
    expect(
      payload.resources.functions.CreateOrderLambdaFunction.error,
    ).toBeDefined()
  })

  test('a descriptor with an empty physicalId is marked not-deployed, never described', async () => {
    const { serverless } = buildHarness({
      stackResources: [
        {
          ...LAMBDA_SUMMARY,
          PhysicalResourceId: '',
          ResourceStatus: 'CREATE_FAILED',
        },
      ],
    })
    fakeInvoke = jest.fn(async () => ({ $metadata: {} }))
    const instance = new AgentInspect(serverless, { functions: true })
    await instance.inspect()

    const payload = lastPayload()
    const entry = payload.resources.functions.CreateOrderLambdaFunction
    expect(entry.error).toMatch(/not deployed|no physical id/i)
    expect(fakeInvoke).not.toHaveBeenCalled()
  })

  test('output is deterministic: categories fixed, logicalIds sorted', async () => {
    const secondLambda = {
      LogicalResourceId: 'AaaLambdaFunction',
      PhysicalResourceId: 'orders-api-dev-aaa',
      ResourceType: 'AWS::Lambda::Function',
      ResourceStatus: 'UPDATE_COMPLETE',
    }
    const { serverless } = buildHarness({
      stackResources: [LAMBDA_SUMMARY, secondLambda, ROLE_SUMMARY],
    })
    fakeInvoke = jest.fn(async () => ({ $metadata: {}, ok: true }))
    const instance = new AgentInspect(serverless, {
      functions: true,
      iam: true,
    })
    await instance.inspect()

    const raw = mockWriteText.mock.calls[0][0]
    const payload = JSON.parse(raw)
    expect(Object.keys(payload.resources.functions)).toEqual([
      'AaaLambdaFunction',
      'CreateOrderLambdaFunction',
    ])
  })
})

describe('IAM-inline dedup (Task 9)', () => {
  const ROLE_ARN = 'arn:aws:iam::123456789012:role/orders-api-dev-lambdaRole'

  // A lambda + iam aware fakeInvoke: GetFunction reports the role ARN, IAM
  // list calls report no policies (empty pages) so runResource's fan-outs are
  // no-ops, and GetRole returns a minimal role body.
  function buildFakeInvoke() {
    return jest.fn(async (awsService, method, input) => {
      if (awsService === 'lambda' && method === 'GetFunction') {
        return {
          $metadata: {},
          Configuration: {
            FunctionName: input.FunctionName,
            Role: ROLE_ARN,
          },
        }
      }
      if (awsService === 'lambda') return { $metadata: {} }
      if (awsService === 'iam' && method === 'GetRole') {
        return {
          $metadata: {},
          Role: { RoleName: input.RoleName, Arn: ROLE_ARN },
        }
      }
      if (awsService === 'iam' && method === 'ListRolePolicies') {
        return { $metadata: {}, PolicyNames: [] }
      }
      if (awsService === 'iam' && method === 'ListAttachedRolePolicies') {
        return { $metadata: {}, AttachedPolicies: [] }
      }
      throw new Error(`unexpected invoke(${awsService}, ${method})`)
    })
  }

  test('--functions alone inlines the role (with its policies) under functions.<id>.role', async () => {
    const { serverless } = buildHarness({ stackResources: [LAMBDA_SUMMARY] })
    fakeInvoke = buildFakeInvoke()
    const instance = new AgentInspect(serverless, { functions: true })
    await instance.inspect()

    const payload = lastPayload()
    const fn = payload.resources.functions.CreateOrderLambdaFunction
    expect(fn.role).toBeDefined()
    expect(fn.role.role.Role.RoleName).toBe('orders-api-dev-lambdaRole')
    expect(fn.role.inlinePolicies).toEqual([])
    expect(fn.role.attachedPolicies).toEqual([])
    // No separate iam category -- the role was inlined, not expanded on its
    // own.
    expect(payload.resources.iam).toBeUndefined()

    // The IAM registry entry's own calls actually ran for the derived role
    // name.
    const iamCalls = fakeInvoke.mock.calls.filter((c) => c[0] === 'iam')
    expect(iamCalls.map((c) => c[1]).sort()).toEqual([
      'GetRole',
      'ListAttachedRolePolicies',
      'ListRolePolicies',
    ])
    expect(
      iamCalls.every((c) => c[2].RoleName === 'orders-api-dev-lambdaRole'),
    ).toBe(true)
  })

  test('--functions --iam and --iam --functions both skip inlining, expand iam separately, and produce identical output', async () => {
    const stackResources = [LAMBDA_SUMMARY, ROLE_SUMMARY]

    const { serverless: s1 } = buildHarness({ stackResources })
    fakeInvoke = buildFakeInvoke()
    const i1 = new AgentInspect(s1, { functions: true, iam: true })
    await i1.inspect()
    const payload1 = lastPayload()

    mockWriteText.mockClear()

    const { serverless: s2 } = buildHarness({ stackResources })
    fakeInvoke = buildFakeInvoke()
    const i2 = new AgentInspect(s2, { iam: true, functions: true })
    await i2.inspect()
    const payload2 = lastPayload()

    // No inlining: the function keeps its raw Configuration.Role reference,
    // no .role attached.
    expect(
      payload1.resources.functions.CreateOrderLambdaFunction.role,
    ).toBeUndefined()
    expect(
      payload1.resources.functions.CreateOrderLambdaFunction.configuration
        .Configuration.Role,
    ).toBe(ROLE_ARN)
    // The role is expanded under its own category instead.
    expect(payload1.resources.iam.IamRoleLambdaExecution).toBeDefined()

    // Flag-order-independent: identical JSON either way.
    expect(payload1).toEqual(payload2)
  })

  test('a shared execution role across two functions is described once', async () => {
    const secondLambda = {
      LogicalResourceId: 'SecondLambdaFunction',
      PhysicalResourceId: 'orders-api-dev-second',
      ResourceType: 'AWS::Lambda::Function',
      ResourceStatus: 'UPDATE_COMPLETE',
    }
    const { serverless } = buildHarness({
      stackResources: [LAMBDA_SUMMARY, secondLambda],
    })
    fakeInvoke = buildFakeInvoke()
    const instance = new AgentInspect(serverless, { functions: true })
    await instance.inspect()

    const payload = lastPayload()
    expect(payload.resources.functions.CreateOrderLambdaFunction.role).toEqual(
      payload.resources.functions.SecondLambdaFunction.role,
    )
    // GetRole (the dedup-sensitive call) only ran once, not once per function.
    const getRoleCalls = fakeInvoke.mock.calls.filter(
      (c) => c[0] === 'iam' && c[1] === 'GetRole',
    )
    expect(getRoleCalls).toHaveLength(1)
  })

  test("a role-describe failure attaches {error} under that function's .role; the function stays present, exit stays 0", async () => {
    const { serverless } = buildHarness({ stackResources: [LAMBDA_SUMMARY] })
    fakeInvoke = jest.fn(async (awsService, method, input) => {
      if (awsService === 'lambda' && method === 'GetFunction') {
        return {
          $metadata: {},
          Configuration: {
            FunctionName: input.FunctionName,
            Role: ROLE_ARN,
          },
        }
      }
      if (awsService === 'lambda') return { $metadata: {} }
      if (awsService === 'iam') {
        const err = new Error('not authorized')
        err.name = 'AccessDeniedException'
        err.$metadata = { httpStatusCode: 403 }
        throw err
      }
      throw new Error(`unexpected invoke(${awsService}, ${method})`)
    })

    const instance = new AgentInspect(serverless, { functions: true })
    await expect(instance.inspect()).resolves.toBeUndefined()

    const payload = lastPayload()
    const fn = payload.resources.functions.CreateOrderLambdaFunction
    expect(fn).toBeDefined()
    expect(fn.role.error).toBeDefined()
  })

  test('partition-agnostic ARN->name derivation: aws-cn and aws-us-gov role ARNs still resolve', async () => {
    const { serverless } = buildHarness({ stackResources: [LAMBDA_SUMMARY] })
    fakeInvoke = jest.fn(async (awsService, method, input) => {
      if (awsService === 'lambda' && method === 'GetFunction') {
        return {
          $metadata: {},
          Configuration: {
            FunctionName: input.FunctionName,
            Role: 'arn:aws-us-gov:iam::123456789012:role/orders-api-dev-lambdaRole',
          },
        }
      }
      if (awsService === 'lambda') return { $metadata: {} }
      if (awsService === 'iam' && method === 'GetRole') {
        return { $metadata: {}, Role: { RoleName: input.RoleName } }
      }
      if (awsService === 'iam' && method === 'ListRolePolicies') {
        return { $metadata: {}, PolicyNames: [] }
      }
      if (awsService === 'iam' && method === 'ListAttachedRolePolicies') {
        return { $metadata: {}, AttachedPolicies: [] }
      }
      throw new Error(`unexpected invoke(${awsService}, ${method})`)
    })

    const instance = new AgentInspect(serverless, { functions: true })
    await instance.inspect()

    const payload = lastPayload()
    expect(
      payload.resources.functions.CreateOrderLambdaFunction.role.role.Role
        .RoleName,
    ).toBe('orders-api-dev-lambdaRole')
  })
})

describe('fatal errors (non-zero exit, single JSON error on stdout)', () => {
  test('non-AWS provider errors up front before any AWS call', async () => {
    const { serverless, provider } = buildHarness({ providerName: 'azure' })
    const instance = new AgentInspect(serverless, {})

    await expect(instance.inspect()).rejects.toMatchObject({
      code: expect.any(String),
    })

    // A structured JSON error was written to stdout exactly once.
    expect(mockWriteText).toHaveBeenCalledTimes(1)
    const payload = JSON.parse(mockWriteText.mock.calls[0][0])
    expect(payload.error).toBeDefined()
    expect(payload.error.code).toBeDefined()
    // No discovery happened.
    expect(provider.request).not.toHaveBeenCalled()
  })

  // A not-yet-deployed stack is NOT fatal: it's a legitimate state for an agent
  // to observe, so inspect returns a clean "not-deployed" envelope and exits 0.
  test('stack-not-deployed returns a graceful not-deployed envelope (exit 0), not an error', async () => {
    const requestImpl = jest.fn(async () => {
      const err = new Error('Stack with id orders-api-dev does not exist')
      err.code = 'ValidationError'
      err.providerError = { code: 'ValidationError' }
      throw err
    })
    const { serverless } = buildHarness({ requestImpl })
    const instance = new AgentInspect(serverless, { functions: true })

    await expect(instance.inspect()).resolves.toBeUndefined()

    const payload = lastPayload()
    expect(payload.error).toBeUndefined()
    expect(payload.mode).toBe('not-deployed')
    expect(payload.region).toBe('us-east-1')
    expect(payload.stage).toBe('dev')
    expect(payload.stackName).toBe('orders-api-dev')
    expect(payload.hint).toMatch(/serverless deploy/i)
    expect(payload.resources).toEqual({})
  })

  test('a bad --name emits a structured error and exits non-zero', async () => {
    const { serverless } = buildHarness({ stackResources: [LAMBDA_SUMMARY] })
    const instance = new AgentInspect(serverless, { name: ['DoesNotExist'] })

    await expect(instance.inspect()).rejects.toBeDefined()

    expect(mockWriteText).toHaveBeenCalledTimes(1)
    const payload = JSON.parse(mockWriteText.mock.calls[0][0])
    expect(payload.error.code).toBe('AGENT_INSPECT_UNKNOWN_NAME')
  })

  test('a bad --aws-services token emits a structured error and exits non-zero', async () => {
    const { serverless } = buildHarness({ stackResources: [LAMBDA_SUMMARY] })
    const instance = new AgentInspect(serverless, {
      'aws-services': 'not-a-real-service',
    })

    await expect(instance.inspect()).rejects.toBeDefined()
    const payload = JSON.parse(mockWriteText.mock.calls[0][0])
    expect(payload.error.code).toBe('AGENT_INSPECT_UNKNOWN_AWS_SERVICE')
  })

  test('a bad --format value errors up front instead of silently falling back to JSON', async () => {
    const { serverless, provider } = buildHarness({
      stackResources: [LAMBDA_SUMMARY],
    })
    const instance = new AgentInspect(serverless, { format: 'bogus' })

    await expect(instance.inspect()).rejects.toMatchObject({
      code: 'AGENT_INSPECT_UNKNOWN_FORMAT',
    })

    // The error document itself falls back to JSON (the requested format is
    // unusable), and no discovery happened.
    expect(mockWriteText).toHaveBeenCalledTimes(1)
    const payload = JSON.parse(mockWriteText.mock.calls[0][0])
    expect(payload.error.code).toBe('AGENT_INSPECT_UNKNOWN_FORMAT')
    expect(payload.error.message).toContain('json, yaml')
    expect(provider.request).not.toHaveBeenCalled()
  })
})
