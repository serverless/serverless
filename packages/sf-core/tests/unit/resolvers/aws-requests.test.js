import { Readable } from 'node:stream'
import { jest } from '@jest/globals'
import { DescribeStacksCommand } from '@aws-sdk/client-cloudformation'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { GetParameterCommand } from '@aws-sdk/client-ssm'
import { HttpResponse } from '@smithy/core/protocols'

jest.unstable_mockModule('@serverless/util', () => ({
  addProxyToAwsClient: jest.fn((client) => client),
  ServerlessError: class ServerlessError extends Error {
    constructor(message, code, options = {}) {
      super(message)
      this.code = code
      this.originalMessage = options.originalMessage
      this.originalName = options.originalName
    }
  },
  ServerlessErrorCodes: {
    resolvers: {
      RESOLVER_AWS_RATE_EXCEEDED: 'RESOLVER_AWS_RATE_EXCEEDED',
      RESOLVER_INVALID_CF_ADDRESS: 'RESOLVER_INVALID_CF_ADDRESS',
    },
  },
}))

const {
  sendAwsRequest,
  invalidateAwsResponseCache,
  logAwsResolverSummary,
  resetAwsResolverState,
} = await import('../../../src/lib/resolvers/providers/aws/clients.js')

const CFN_NS = 'http://cloudformation.amazonaws.com/doc/2010-05-15/'
const describeStacksXml = (stackName, outputs) =>
  `<DescribeStacksResponse xmlns="${CFN_NS}"><DescribeStacksResult><Stacks><member>` +
  `<StackName>${stackName}</StackName><CreationTime>2020-01-01T00:00:00Z</CreationTime>` +
  `<StackStatus>CREATE_COMPLETE</StackStatus><Outputs>` +
  outputs
    .map(
      ([k, v]) =>
        `<member><OutputKey>${k}</OutputKey><OutputValue>${v}</OutputValue></member>`,
    )
    .join('') +
  `</Outputs></member></Stacks></DescribeStacksResult>` +
  `<ResponseMetadata><RequestId>req-1</RequestId></ResponseMetadata></DescribeStacksResponse>`
const cfnErrorXml = (code, message) =>
  `<ErrorResponse xmlns="${CFN_NS}"><Error><Type>Sender</Type><Code>${code}</Code>` +
  `<Message>${message}</Message></Error><RequestId>req-2</RequestId></ErrorResponse>`
const ssmParameterJson = (name, value) =>
  JSON.stringify({
    Parameter: { Name: name, Type: 'String', Value: value, Version: 1 },
  })

const ok = (body, contentType = 'text/xml') => ({
  status: 200,
  body,
  contentType,
})
const throttled = () => ({
  status: 400,
  body: cfnErrorXml('Throttling', 'Rate exceeded'),
})
/** Amazon S3's own throttling response, as the Terraform state read sees it. */
const s3Throttled = () => ({
  status: 503,
  body:
    '<?xml version="1.0" encoding="UTF-8"?><Error><Code>SlowDown</Code>' +
    '<Message>Please reduce your request rate.</Message>' +
    '<RequestId>req-3</RequestId><HostId>host-3</HostId></Error>',
})
const validationError = () => ({
  status: 400,
  body: cfnErrorXml(
    'ValidationError',
    'Stack with id missing-stack does not exist',
  ),
})

/** Fake SDK request handler: replays `plan` in order, repeating the last entry. */
const fakeHandler = (plan) => {
  const queue = [...plan]
  const handle = jest.fn(async () => {
    const next = queue.length > 1 ? queue.shift() : queue[0]
    return {
      response: new HttpResponse({
        statusCode: next.status,
        headers: { 'content-type': next.contentType ?? 'text/xml' },
        body: Readable.from([Buffer.from(next.body)]),
      }),
    }
  })
  return {
    handle,
    destroy() {},
    updateHttpClientConfig() {},
    httpHandlerConfigs() {
      return {}
    },
    metadata: { handlerProtocol: 'http/1.1' },
  }
}

/**
 * Fake SDK request handler whose FIRST request stays in flight until the test
 * calls `release()` (it then fails with a ValidationError); every later request
 * succeeds immediately. Lets a test interleave an invalidation and a second
 * fetch with an older request's rejection.
 */
const handlerHoldingFirstRequest = () => {
  let release
  const held = new Promise((resolve) => {
    release = resolve
  })
  const respond = (entry) => ({
    response: new HttpResponse({
      statusCode: entry.status,
      headers: { 'content-type': entry.contentType ?? 'text/xml' },
      body: Readable.from([Buffer.from(entry.body)]),
    }),
  })
  const handle = jest.fn(async () => {
    if (handle.mock.calls.length === 1) {
      await held
      return respond(validationError())
    }
    return respond(ok(describeStacksXml('stack-a', [['OutA', 'a-one']])))
  })
  return {
    handle,
    release: () => release(),
    destroy() {},
    updateHttpClientConfig() {},
    httpHandlerConfigs() {
      return {}
    },
    metadata: { handlerProtocol: 'http/1.1' },
  }
}

/** Let the event loop run until `handler` has been asked for `count` requests. */
const waitForRequests = async (handler, count) => {
  for (let i = 0; i < 100 && handler.handle.mock.calls.length < count; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  expect(handler.handle).toHaveBeenCalledTimes(count)
}

const credentials = { accessKeyId: 'AKIAEXAMPLE', secretAccessKey: 'secret' }
const otherCredentials = { accessKeyId: 'AKIAOTHER', secretAccessKey: 'secret' }
const region = 'us-east-1'
const originalEnv = { ...process.env }
let logger

const describeStack = (overrides = {}) =>
  sendAwsRequest({
    service: 'cloudformation',
    credentials,
    region,
    logger,
    command: new DescribeStacksCommand({ StackName: 'stack-a' }),
    target: 'stack-a',
    cache: true,
    ...overrides,
  })

describe('sendAwsRequest', () => {
  jest.setTimeout(20_000)

  beforeEach(() => {
    process.env.AWS_CONFIG_FILE = '/nonexistent/aws-config'
    process.env.AWS_SHARED_CREDENTIALS_FILE = '/nonexistent/aws-credentials'
    delete process.env.AWS_PROFILE
    delete process.env.AWS_MAX_ATTEMPTS
    delete process.env.AWS_RETRY_MODE
    logger = { info: jest.fn(), debug: jest.fn() }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  test('returns the parsed SDK output', async () => {
    const handler = fakeHandler([
      ok(describeStacksXml('stack-a', [['OutA', 'a-one']])),
    ])
    resetAwsResolverState({ requestHandler: handler })
    const output = await describeStack()
    expect(output.Stacks[0].Outputs).toEqual([
      { OutputKey: 'OutA', OutputValue: 'a-one' },
    ])
    expect(handler.handle).toHaveBeenCalledTimes(1)
  })

  test('with cache: true, the same principal, region and target share one call', async () => {
    const handler = fakeHandler([
      ok(describeStacksXml('stack-a', [['OutA', 'a-one']])),
    ])
    resetAwsResolverState({ requestHandler: handler })
    const [first, second, third] = await Promise.all([
      describeStack(),
      describeStack(),
      describeStack(),
    ])
    expect(handler.handle).toHaveBeenCalledTimes(1)
    expect(first).toBe(second)
    expect(second).toBe(third)
  })

  test('invalidateAwsResponseCache forgets cached responses but keeps the counters', async () => {
    const handler = fakeHandler([
      ok(describeStacksXml('stack-a', [['OutA', 'a-one']])),
    ])
    resetAwsResolverState({ requestHandler: handler })
    await describeStack()
    await describeStack()
    expect(handler.handle).toHaveBeenCalledTimes(1)

    invalidateAwsResponseCache()

    await describeStack()
    // The third placeholder re-fetched: the cached response was forgotten.
    expect(handler.handle).toHaveBeenCalledTimes(2)
    // The summary stays cumulative and honest across the invalidation: three
    // placeholders, one stack, and both calls are still reported.
    logAwsResolverSummary(logger)
    expect(logger.debug).toHaveBeenCalledWith(
      'cf: 3 placeholders, 1 stacks, 2 DescribeStacks calls, 0 throttled attempts',
    )
  })

  test('terraform requests are reported under their own label and nouns', async () => {
    resetAwsResolverState({
      requestHandler: fakeHandler([ok('{"outputs":{}}', 'application/json')]),
    })
    const output = await sendAwsRequest({
      service: 'terraform',
      credentials,
      region,
      logger,
      command: new GetObjectCommand({
        Bucket: 'state-bucket',
        Key: 'prod/network.tfstate',
      }),
      target: 'state-bucket/prod/network.tfstate',
    })
    expect(await output.Body.transformToString()).toBe('{"outputs":{}}')
    logAwsResolverSummary(logger)
    expect(logger.debug).toHaveBeenCalledWith(
      'terraform: 1 state files, 1 GetObject calls, 0 throttled attempts',
    )
  })

  test('the API name drops the numeric suffix the bundler appends to duplicate class names', async () => {
    // esbuild emits the SDK's command classes as e.g. `DescribeStacksCommand7`
    // in the release bundle; the API must still read `DescribeStacks`.
    class DescribeStacksCommand7 extends DescribeStacksCommand {}
    resetAwsResolverState({
      requestHandler: fakeHandler([
        ok(describeStacksXml('stack-a', [['OutA', 'a-one']])),
      ]),
    })
    await describeStack({
      command: new DescribeStacksCommand7({ StackName: 'stack-a' }),
    })
    logAwsResolverSummary(logger)
    expect(logger.debug).toHaveBeenCalledWith(
      'cf: 1 placeholders, 1 stacks, 1 DescribeStacks calls, 0 throttled attempts',
    )
  })

  test('a request that fails after an invalidation does not evict the entry cached since', async () => {
    const handler = handlerHoldingFirstRequest()
    resetAwsResolverState({ requestHandler: handler })

    // The first placeholder's request is in flight and held open.
    const firstSettled = describeStack().then(
      () => 'resolved',
      () => 'rejected',
    )
    await waitForRequests(handler, 1)

    // A mutating service run finishes and clears the cache, then a later
    // placeholder starts its own fetch for the same key.
    invalidateAwsResponseCache()
    const second = describeStack()
    await waitForRequests(handler, 2)

    // Only now does the older request fail. Its cleanup must not take the
    // newer entry with it.
    handler.release()
    expect(await firstSettled).toBe('rejected')
    expect((await second).Stacks[0].Outputs).toEqual([
      { OutputKey: 'OutA', OutputValue: 'a-one' },
    ])

    await describeStack()
    expect(handler.handle).toHaveBeenCalledTimes(2)
  })

  test('credential provider functions that resolve to the same access key share the cache', async () => {
    const handler = fakeHandler([
      ok(describeStacksXml('stack-a', [['OutA', 'a-one']])),
    ])
    resetAwsResolverState({ requestHandler: handler })
    await describeStack({ credentials: async () => credentials })
    await describeStack({ credentials: async () => ({ ...credentials }) })
    expect(handler.handle).toHaveBeenCalledTimes(1)
  })

  test('the credential provider is invoked with the resolver region bound as the caller config', async () => {
    const handler = fakeHandler([
      ok(describeStacksXml('stack-a', [['OutA', 'a-one']])),
    ])
    resetAwsResolverState({ requestHandler: handler })
    let invocations = 0
    let seen
    const recording = async (options) => {
      invocations += 1
      if (invocations === 1) seen = options
      return credentials
    }
    await describeStack({ credentials: recording, region: 'eu-west-1' })
    // The SDK binds its resolved client config to the provider as
    // `callerClientConfig`; providers such as `credential-provider-ini` read the
    // region off it to pick the AssumeRole region. Resolving the principal
    // through the raw provider instead would leave it unbound.
    expect(seen.callerClientConfig).toBeDefined()
    expect(await seen.callerClientConfig.region()).toBe('eu-west-1')
  })

  test('a different principal, region or target is a different cache entry', async () => {
    const handler = fakeHandler([
      ok(describeStacksXml('stack-a', [['OutA', 'a-one']])),
    ])
    resetAwsResolverState({ requestHandler: handler })
    await describeStack()
    await describeStack({ credentials: otherCredentials })
    await describeStack({ region: 'eu-west-1' })
    await describeStack({
      command: new DescribeStacksCommand({ StackName: 'stack-b' }),
      target: 'stack-b',
    })
    expect(handler.handle).toHaveBeenCalledTimes(4)
  })

  test('without cache every call is sent', async () => {
    const handler = fakeHandler([
      ok(ssmParameterJson('/p', 'v'), 'application/x-amz-json-1.1'),
    ])
    resetAwsResolverState({ requestHandler: handler })
    const send = () =>
      sendAwsRequest({
        service: 'ssm',
        credentials,
        region,
        logger,
        command: new GetParameterCommand({ Name: '/p', WithDecryption: true }),
        target: '/p',
      })
    const [a, b] = await Promise.all([send(), send()])
    expect(a.Parameter.Value).toBe('v')
    expect(b.Parameter.Value).toBe('v')
    expect(handler.handle).toHaveBeenCalledTimes(2)
  })

  test('a rejected cached promise is evicted so the next call retries', async () => {
    const handler = fakeHandler([
      validationError(),
      ok(describeStacksXml('stack-a', [['OutA', 'a-one']])),
    ])
    resetAwsResolverState({ requestHandler: handler })
    await expect(describeStack()).rejects.toMatchObject({
      name: 'ValidationError',
    })
    const output = await describeStack()
    expect(output.Stacks[0].StackName).toBe('stack-a')
    expect(handler.handle).toHaveBeenCalledTimes(2)
  })

  test('a failed credential resolution is not cached, so the next call retries it', async () => {
    const handler = fakeHandler([
      ok(describeStacksXml('stack-a', [['OutA', 'a-one']])),
    ])
    resetAwsResolverState({ requestHandler: handler })
    let calls = 0
    const expired = Object.assign(new Error('Token is expired'), {
      name: 'CredentialsProviderError',
    })
    const flaky = async () => {
      calls += 1
      if (calls === 1) throw expired
      return credentials
    }
    await expect(describeStack({ credentials: flaky })).rejects.toBe(expired)
    expect(handler.handle).toHaveBeenCalledTimes(0)
    const output = await describeStack({ credentials: flaky })
    expect(output.Stacks[0].StackName).toBe('stack-a')
    expect(handler.handle).toHaveBeenCalledTimes(1)
    // The rejected probe, then the retried probe: the provider was re-invoked
    // rather than memoized across the two calls. Signing the second request
    // adds no third invocation, because the principal is read through the
    // client's own memoized provider.
    expect(calls).toBe(2)
  })

  test('non-throttling SDK errors are rethrown unchanged', async () => {
    const handler = fakeHandler([validationError()])
    resetAwsResolverState({ requestHandler: handler })
    const error = await describeStack().catch((e) => e)
    expect(error.name).toBe('ValidationError')
    expect(error.message).toBe('Stack with id missing-stack does not exist')
    expect(error.code).toBeUndefined()
  })

  test('logs one info line per throttled retry and succeeds when the SDK recovers', async () => {
    process.env.AWS_MAX_ATTEMPTS = '3'
    const handler = fakeHandler([
      throttled(),
      ok(describeStacksXml('stack-a', [['OutA', 'a-one']])),
    ])
    resetAwsResolverState({ requestHandler: handler })
    const output = await describeStack()
    expect(output.Stacks[0].StackName).toBe('stack-a')
    expect(handler.handle).toHaveBeenCalledTimes(2)
    expect(logger.info).toHaveBeenCalledTimes(1)
    expect(logger.info).toHaveBeenCalledWith(
      'DescribeStacks throttled (Throttling: Rate exceeded), retrying (attempt 2 of 3)',
    )
  })

  test('exhausted throttling retries become RESOLVER_AWS_RATE_EXCEEDED with a teaching message', async () => {
    process.env.AWS_MAX_ATTEMPTS = '2'
    const handler = fakeHandler([throttled()])
    resetAwsResolverState({ requestHandler: handler })
    const error = await describeStack().catch((e) => e)
    expect(handler.handle).toHaveBeenCalledTimes(2)
    expect(error.code).toBe('RESOLVER_AWS_RATE_EXCEEDED')
    expect(error.providerError.name).toBe('Throttling')
    expect(error.message).toMatch(
      /^AWS CloudFormation rejected DescribeStacks with "Throttling: Rate exceeded" after 2 attempts \(\d+ s\)\. /,
    )
    expect(error.message).toContain(
      'This run needed 1 DescribeStacks calls for 1 stacks referenced by ${cf:} variables.',
    )
    expect(error.message).toContain(
      'Retry, run fewer deployments in this account and region at the same time, or allow more attempts with AWS_MAX_ATTEMPTS=15 (AWS_RETRY_MODE=adaptive also makes this client slow itself down).',
    )
    expect(error.message).toContain(
      'Learn more: https://repost.aws/knowledge-center/cloudformation-rate-exceeded-error',
    )
    expect(logger.info).toHaveBeenCalledWith(
      'DescribeStacks throttled (Throttling: Rate exceeded), retrying (attempt 2 of 2)',
    )
  })

  test('exhausted throttling on a Terraform state read names state files and the terraform variable', async () => {
    process.env.AWS_MAX_ATTEMPTS = '2'
    const handler = fakeHandler([s3Throttled()])
    resetAwsResolverState({ requestHandler: handler })
    const error = await sendAwsRequest({
      service: 'terraform',
      credentials,
      region,
      logger,
      command: new GetObjectCommand({
        Bucket: 'state-bucket',
        Key: 'prod/network.tfstate',
      }),
      target: 'state-bucket/prod/network.tfstate',
    }).catch((e) => e)
    expect(handler.handle).toHaveBeenCalledTimes(2)
    expect(error.code).toBe('RESOLVER_AWS_RATE_EXCEEDED')
    expect(error.message).toContain(
      'This run needed 1 GetObject calls for 1 state files referenced by ${terraform:outputs:} variables.',
    )
  })

  test('the debug summary reports placeholders, distinct targets, calls and throttled attempts once', async () => {
    process.env.AWS_MAX_ATTEMPTS = '3'
    const handler = fakeHandler([
      throttled(),
      ok(describeStacksXml('stack-a', [['OutA', 'a-one']])),
    ])
    resetAwsResolverState({ requestHandler: handler })
    await describeStack()
    await describeStack()
    await describeStack({
      command: new DescribeStacksCommand({ StackName: 'stack-b' }),
      target: 'stack-b',
    })
    logAwsResolverSummary(logger)
    expect(logger.debug).toHaveBeenCalledWith(
      'cf: 3 placeholders, 2 stacks, 2 DescribeStacks calls, 1 throttled attempts',
    )
    logger.debug.mockClear()
    logAwsResolverSummary(logger)
    expect(logger.debug).not.toHaveBeenCalled()
  })

  test('an unchanged service is not reprinted by a later summary', async () => {
    const handler = fakeHandler([
      ok(describeStacksXml('stack-a', [['OutA', 'a-one']])),
      ok(ssmParameterJson('/p', 'v'), 'application/x-amz-json-1.1'),
      ok(describeStacksXml('stack-b', [['OutB', 'b-one']])),
    ])
    resetAwsResolverState({ requestHandler: handler })
    const linesStartingWith = (prefix) =>
      logger.debug.mock.calls
        .map(([line]) => line)
        .filter((line) => line.startsWith(prefix))

    await describeStack()
    logAwsResolverSummary(logger)
    expect(linesStartingWith('cf:')).toEqual([
      'cf: 1 placeholders, 1 stacks, 1 DescribeStacks calls, 0 throttled attempts',
    ])

    // Another service resolving something prints its own line only: the
    // CloudFormation numbers did not move, so that line is not repeated.
    await sendAwsRequest({
      service: 'ssm',
      credentials,
      region,
      logger,
      command: new GetParameterCommand({ Name: '/p' }),
      target: '/p',
      cache: true,
    })
    logAwsResolverSummary(logger)
    expect(linesStartingWith('ssm:')).toEqual([
      'ssm: 1 placeholders, 1 parameters, 1 GetParameter calls, 0 throttled attempts',
    ])
    expect(linesStartingWith('cf:')).toHaveLength(1)
    expect(logger.debug).toHaveBeenCalledTimes(2)

    // Reading a second stack moves the CloudFormation numbers, so its line
    // prints again - with the new totals.
    await describeStack({
      command: new DescribeStacksCommand({ StackName: 'stack-b' }),
      target: 'stack-b',
    })
    logAwsResolverSummary(logger)
    expect(linesStartingWith('cf:')).toEqual([
      'cf: 1 placeholders, 1 stacks, 1 DescribeStacks calls, 0 throttled attempts',
      'cf: 2 placeholders, 2 stacks, 2 DescribeStacks calls, 0 throttled attempts',
    ])
    expect(linesStartingWith('ssm:')).toHaveLength(1)
  })

  test('a summary with nothing new prints nothing', async () => {
    const handler = fakeHandler([
      ok(describeStacksXml('stack-a', [['OutA', 'a-one']])),
    ])
    resetAwsResolverState({ requestHandler: handler })
    await describeStack()
    logAwsResolverSummary(logger)
    expect(logger.debug).toHaveBeenCalledTimes(1)

    logAwsResolverSummary(logger)
    logAwsResolverSummary(logger)
    expect(logger.debug).toHaveBeenCalledTimes(1)
  })

  test('the debug summary counts one stack read with two credentials as one stack', async () => {
    const handler = fakeHandler([
      ok(describeStacksXml('stack-a', [['OutA', 'a-one']])),
    ])
    resetAwsResolverState({ requestHandler: handler })
    await describeStack()
    await describeStack({ credentials: otherCredentials })
    // Each Compose service that assumes a role or signs in through SSO on its
    // own gets a different temporary access key for the same account, so the
    // stack count is distinct per region regardless of the credentials that
    // read it: two calls, but still one stack.
    logAwsResolverSummary(logger)
    expect(logger.debug).toHaveBeenCalledTimes(1)
    expect(logger.debug).toHaveBeenCalledWith(
      'cf: 2 placeholders, 1 stacks, 2 DescribeStacks calls, 0 throttled attempts',
    )
  })

  test('the debug summary counts one stack name in two regions as two stacks', async () => {
    const handler = fakeHandler([
      ok(describeStacksXml('stack-a', [['OutA', 'a-one']])),
    ])
    resetAwsResolverState({ requestHandler: handler })
    await describeStack()
    await describeStack({ region: 'eu-west-1' })
    logAwsResolverSummary(logger)
    expect(logger.debug).toHaveBeenCalledTimes(1)
    expect(logger.debug).toHaveBeenCalledWith(
      'cf: 2 placeholders, 2 stacks, 2 DescribeStacks calls, 0 throttled attempts',
    )
  })

  test('a rate-exceeded error sums every credential scope in the throttled region', async () => {
    process.env.AWS_MAX_ATTEMPTS = '2'
    const stackA = ok(describeStacksXml('stack-a', [['OutA', 'a-one']]))
    const handler = fakeHandler([stackA, stackA, throttled()])
    resetAwsResolverState({ requestHandler: handler })
    await describeStack()
    await describeStack({ credentials: otherCredentials })
    const error = await describeStack({
      credentials: { accessKeyId: 'AKIATHIRD', secretAccessKey: 'secret' },
    }).catch((e) => e)
    expect(error.code).toBe('RESOLVER_AWS_RATE_EXCEEDED')
    // CloudFormation rate limits the account and region, not the temporary
    // access key: all three reads of this region count towards what the run
    // spent, and the one stack they all read counts once.
    expect(error.message).toContain(
      'This run needed 3 DescribeStacks calls for 1 stacks referenced by ${cf:} variables.',
    )
  })

  test('a rate-exceeded error leaves another region out of the count', async () => {
    process.env.AWS_MAX_ATTEMPTS = '2'
    const handler = fakeHandler([
      ok(describeStacksXml('stack-a', [['OutA', 'a-one']])),
      ok(describeStacksXml('stack-b', [['OutB', 'b-one']])),
      throttled(),
    ])
    resetAwsResolverState({ requestHandler: handler })
    await describeStack()
    await describeStack({
      region: 'eu-west-1',
      command: new DescribeStacksCommand({ StackName: 'stack-b' }),
      target: 'stack-b',
    })
    const error = await describeStack({
      credentials: otherCredentials,
    }).catch((e) => e)
    expect(error.code).toBe('RESOLVER_AWS_RATE_EXCEEDED')
    // Each region has its own rate limit, so the eu-west-1 read is neither a
    // call nor a stack of what us-east-1 spent.
    expect(error.message).toContain(
      'This run needed 2 DescribeStacks calls for 1 stacks referenced by ${cf:} variables.',
    )
  })

  test('the summary is silent for services that resolved nothing', () => {
    resetAwsResolverState()
    logAwsResolverSummary(logger)
    expect(logger.debug).not.toHaveBeenCalled()
  })

  // `m/<letters>` in the user agent is the SDK's feature list; it emits `E` for
  // RETRY_MODE_STANDARD and `F` for RETRY_MODE_ADAPTIVE, and only when it can read
  // `mode` off the retry strategy - which the resolver's decorator has to preserve.
  const retryModeFeature = (handler) =>
    /\bm\/([^\s]+)/.exec(
      handler.handle.mock.calls[0][0].headers['user-agent'],
    )?.[1]

  test('the decorated retry strategy still reports the retry mode to the SDK', async () => {
    const handler = fakeHandler([
      ok(describeStacksXml('stack-a', [['OutA', 'a-one']])),
    ])
    resetAwsResolverState({ requestHandler: handler })
    expect((await describeStack()).Stacks[0].StackName).toBe('stack-a')
    expect(retryModeFeature(handler)).toContain('E')
  })

  test('the decorated retry strategy works under the adaptive strategy', async () => {
    process.env.AWS_RETRY_MODE = 'adaptive'
    const handler = fakeHandler([
      ok(describeStacksXml('stack-a', [['OutA', 'a-one']])),
    ])
    resetAwsResolverState({ requestHandler: handler })
    expect((await describeStack()).Stacks[0].StackName).toBe('stack-a')
    expect(retryModeFeature(handler)).toContain('F')
  })
})
