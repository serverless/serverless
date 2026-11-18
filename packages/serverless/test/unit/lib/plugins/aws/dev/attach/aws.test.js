import { jest } from '@jest/globals'
import {
  GetFunctionCommand,
  GetLayerVersionCommand,
  ListLayerVersionsCommand,
  UpdateFunctionConfigurationCommand,
} from '@aws-sdk/client-lambda'
import { GetRolePolicyCommand } from '@aws-sdk/client-iam'
import {
  CreateWebFunctionRevisionCommand,
  DeleteWebFunctionEndpointCommand,
  DeleteWebFunctionRevisionCommand,
  GetWebFunctionEndpointCommand,
  GetWebFunctionRevisionCommand,
  ListWebFunctionEndpointsCommand,
  ListWebFunctionRevisionsCommand,
} from '@aws-sdk/client-lambda-web'
import { log } from '@serverless/util'
import {
  awsErrorOf,
  createDevModeClients,
  createSdkClients,
  credentialsInvalidError,
  isAccessDenied,
  isCredentialError,
  findIotEndpoint,
  providerCallError,
  retryDelayMs,
  waitForUpdate,
  withBackoff,
  PRE_COMMAND_CONNECTION_TIMEOUT_MS,
  PRE_COMMAND_RETRY,
} from '../../../../../../../lib/plugins/aws/dev/attach/aws.js'
import { droppedConnections } from './dropped-connections.js'

const noJitter = () => 0
const throttle = (retryAfterSeconds) =>
  Object.assign(new Error('Rate exceeded'), {
    name: 'TooManyRequestsException',
    retryAfterSeconds,
    $metadata: { httpStatusCode: 429 },
  })
const named = (name, message = name) =>
  Object.assign(new Error(message), { name })
const failing = (name, httpStatusCode) =>
  Object.assign(named(name), { $metadata: { httpStatusCode } })
const withCode = (code) => Object.assign(new Error(`connect ${code}`), { code })
const dnsNotFound = (host) =>
  Object.assign(new Error(`getaddrinfo ENOTFOUND ${host}`), {
    code: 'ENOTFOUND',
  })
const resolvesAll = async () => ({ address: '192.0.2.1', family: 4 })

test('throttles honour retryAfterSeconds and back off exponentially up to 8 s', () => {
  expect(retryDelayMs(throttle('3'), 0, noJitter)).toBe(3000)
  expect(retryDelayMs(throttle(undefined), 0, noJitter)).toBe(250)
  expect(retryDelayMs(throttle(undefined), 3, noJitter)).toBe(2000)
  expect(retryDelayMs(throttle(undefined), 10, noJitter)).toBe(8000)
  expect(retryDelayMs(named('ThrottlingException'), 0, noJitter)).toBe(250)
})

test('conflicts, stale revisions, denials and bad input are not retried here', () => {
  for (const name of [
    'ResourceConflictException',
    'PreconditionFailedException',
    'AccessDeniedException',
    'InvalidParameterValueException',
  ]) {
    expect(retryDelayMs(named(name), 0, noJitter)).toBeNull()
  }
})

test('network resets are retried', () => {
  expect(
    retryDelayMs(
      Object.assign(new Error('socket'), { code: 'ECONNRESET' }),
      1,
      noJitter,
    ),
  ).toBe(500)
})

test('Retry-After is a floor with bounded jitter on top, so throttled workers spread out', () => {
  expect(retryDelayMs(throttle('3'), 0, () => 0.5)).toBe(3375)
  const delays = [0, 0.25, 0.5, 0.75, 0.999].map((r) =>
    retryDelayMs(throttle('2'), 0, () => r),
  )
  expect(new Set(delays).size).toBe(delays.length)
  for (const delay of delays) {
    expect(delay).toBeGreaterThanOrEqual(2000)
    expect(delay).toBeLessThan(2500)
  }
  expect(retryDelayMs(throttle('20'), 0, () => 0.999)).toBeLessThan(21_000)
})

test('Retry-After is capped at 30 s', () => {
  expect(retryDelayMs(throttle('120'), 0, noJitter)).toBe(30_000)
  expect(retryDelayMs(throttle('3600'), 0, () => 0.999)).toBeLessThan(31_000)
})

test('network failures, SDK timeouts and 5xx responses are retried', () => {
  for (const code of [
    'ECONNREFUSED',
    'EAI_AGAIN',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'ETIMEDOUT',
    'EPIPE',
  ]) {
    expect(retryDelayMs(withCode(code), 0, noJitter)).toBe(250)
  }
  expect(retryDelayMs(named('TimeoutError'), 0, noJitter)).toBe(250)
  expect(retryDelayMs(failing('ServiceException', 500), 0, noJitter)).toBe(250)
  expect(retryDelayMs(failing('ServiceUnavailable', 503), 0, noJitter)).toBe(
    250,
  )
})

test('a DNS lookup that fails with ENOTFOUND is retried like EAI_AGAIN', () => {
  expect(
    retryDelayMs(dnsNotFound('lambda.us-east-1.amazonaws.com'), 0, noJitter),
  ).toBe(250)
  expect(retryDelayMs(withCode('ENOTFOUND'), 2, noJitter)).toBe(1000)
})

test('an ENOTFOUND that never clears gives up after maxAttempts', async () => {
  let calls = 0
  await expect(
    withBackoff(
      async () => {
        calls += 1
        throw dnsNotFound('lambda.us-east-1.amazonaws.com')
      },
      { sleep: async () => {}, random: noJitter, maxAttempts: 4 },
    ),
  ).rejects.toMatchObject({ code: 'ENOTFOUND' })
  expect(calls).toBe(4)
})

test('412, 409, 403 and validation responses are not retried', () => {
  expect(
    retryDelayMs(failing('PreconditionFailedException', 412), 0, noJitter),
  ).toBeNull()
  expect(
    retryDelayMs(failing('ResourceConflictException', 409), 0, noJitter),
  ).toBeNull()
  expect(
    retryDelayMs(failing('AccessDeniedException', 403), 0, noJitter),
  ).toBeNull()
  expect(
    retryDelayMs(failing('ValidationException', 400), 0, noJitter),
  ).toBeNull()
})

test('withBackoff retries until success and gives up after maxAttempts', async () => {
  const waits = []
  let calls = 0
  const result = await withBackoff(
    async () => {
      calls += 1
      if (calls < 3) throw throttle('1')
      return 'ok'
    },
    { sleep: async (ms) => waits.push(ms), random: noJitter },
  )
  expect(result).toBe('ok')
  expect(waits).toEqual([1000, 1000])
  await expect(
    withBackoff(
      async () => {
        throw throttle()
      },
      { sleep: async () => {}, random: noJitter, maxAttempts: 3 },
    ),
  ).rejects.toThrow('Rate exceeded')
})

describe('the policy of the checks before another command', () => {
  // Calls `fail()` until it has thrown `failures` times, then answers; returns the attempts made.
  const attempts = async (error, failures = Infinity) => {
    let calls = 0
    await withBackoff(
      async () => {
        calls += 1
        if (calls <= failures) throw error()
        return 'ok'
      },
      { sleep: async () => {}, random: noJitter, ...PRE_COMMAND_RETRY },
    ).catch(() => {})
    return calls
  }

  test('a network error is not retried', async () => {
    expect(await attempts(() => withCode('ECONNREFUSED'))).toBe(1)
    expect(await attempts(() => withCode('ENOTFOUND'))).toBe(1)
    expect(await attempts(() => named('TimeoutError'))).toBe(1)
  })

  test('a server error is retried once', async () => {
    expect(await attempts(() => failing('ServiceException', 500))).toBe(2)
    expect(await attempts(() => failing('ServiceUnavailable', 503))).toBe(2)
    expect(
      await attempts(() => Object.assign(named('Weird'), { $retryable: {} })),
    ).toBe(2)
    expect(await attempts(() => failing('ServiceException', 500), 1)).toBe(2)
  })

  test('throttling is retried twice', async () => {
    expect(await attempts(() => throttle())).toBe(3)
    expect(await attempts(() => throttle(), 2)).toBe(3)
    expect(await attempts(() => throttle(), 1)).toBe(2)
  })

  test("each wait is at most a second, whatever the throttle's retry-after asks for", async () => {
    const waits = []
    await withBackoff(
      async () => {
        throw throttle('30')
      },
      {
        sleep: async (ms) => waits.push(ms),
        random: () => 0.999,
        ...PRE_COMMAND_RETRY,
      },
    ).catch(() => {})
    expect(waits).toHaveLength(2)
    for (const ms of waits) expect(ms).toBeLessThanOrEqual(1_000)
  })

  test("the full policy keeps a throttle's retry-after", async () => {
    const waits = []
    await withBackoff(
      async () => {
        throw throttle('3')
      },
      { sleep: async (ms) => waits.push(ms), random: noJitter, maxAttempts: 2 },
    ).catch(() => {})
    expect(waits).toEqual([3_000])
  })

  test('the full policy, without it, retries every kind up to 8 attempts', async () => {
    let calls = 0
    await withBackoff(
      async () => {
        calls += 1
        throw withCode('ECONNREFUSED')
      },
      { sleep: async () => {}, random: noJitter },
    ).catch(() => {})
    expect(calls).toBe(8)
  })

  test('the clients take it as their one retry option', async () => {
    let calls = 0
    const send = async () => {
      calls += 1
      throw withCode('ECONNREFUSED')
    }
    const clients = createDevModeClients({
      provider: { getProfile: () => undefined },
      region: 'us-east-1',
      sdk: { lambda: { send }, iam: { send }, iot: { send } },
      retry: { ...PRE_COMMAND_RETRY, sleep: async () => {} },
    })
    await expect(clients.lambda.getFunction('f')).rejects.toMatchObject({
      code: 'ECONNREFUSED',
    })
    expect(calls).toBe(1)
  })
})

test('errors the Framework provider wrapped are classified by the AWS error inside', () => {
  const wrap = (providerError, message = 'wrapped') =>
    Object.assign(new Error(message), {
      name: 'ServerlessError',
      code: 'AWS_S_T_S_GET_CALLER_IDENTITY_ERROR',
      providerError,
    })
  const v2Denied = awsErrorOf(
    wrap({ code: 'AccessDenied', statusCode: 403, message: 'not allowed' }),
  )
  expect(isAccessDenied(v2Denied)).toBe(true)
  expect(v2Denied.message).toBe('not allowed')
  expect(
    isCredentialError(
      awsErrorOf(wrap({ code: 'ExpiredToken', statusCode: 403 })),
    ),
  ).toBe(true)
  const v3Expired = awsErrorOf(
    wrap(
      {
        name: 'ExpiredTokenException',
        code: 'ExpiredTokenException',
        $metadata: { httpStatusCode: 403 },
      },
      'The security token included in the request is expired',
    ),
  )
  expect(isCredentialError(v3Expired)).toBe(true)
  expect(isAccessDenied(v3Expired)).toBe(false)
  expect(v3Expired.message).toContain('is expired')
  expect(
    isAccessDenied(awsErrorOf(wrap({ code: 'Throttling', statusCode: 400 }))),
  ).toBe(false)
  const raw = named('AccessDeniedException')
  expect(awsErrorOf(raw)).toBe(raw)
})

test('isAccessDenied recognises Lambda, IAM and HTTP 403 denials', () => {
  expect(isAccessDenied(named('AccessDeniedException'))).toBe(true)
  expect(isAccessDenied(named('AccessDenied'))).toBe(true)
  expect(isAccessDenied({ $metadata: { httpStatusCode: 403 } })).toBe(true)
  expect(isAccessDenied(named('ResourceNotFoundException'))).toBe(false)
})

test('expired or invalid credentials are credential errors, not denials', () => {
  for (const name of [
    'ExpiredTokenException',
    'ExpiredToken',
    'UnrecognizedClientException',
    'InvalidClientTokenId',
  ]) {
    expect(isAccessDenied(failing(name, 403))).toBe(false)
    expect(isCredentialError(failing(name, 403))).toBe(true)
  }
  expect(isCredentialError(named('AccessDeniedException'))).toBe(false)
})

test('waitForUpdate polls GetFunction until the update settles', async () => {
  const states = ['InProgress', 'InProgress', 'Successful']
  const lambda = {
    getFunction: async () => ({ LastUpdateStatus: states.shift() }),
  }
  const waits = []
  expect(
    await waitForUpdate({
      lambda,
      name: 'fn',
      sleep: async (ms) => waits.push(ms),
    }),
  ).toEqual({ LastUpdateStatus: 'Successful' })
  expect(waits).toEqual([500, 750])
})

test('waitForUpdate also waits for a function that is still being created', async () => {
  const states = [
    { State: 'Pending', LastUpdateStatus: 'Successful' },
    { State: 'Active', LastUpdateStatus: 'Successful' },
  ]
  const lambda = { getFunction: async () => states.shift() }
  const waits = []
  expect(
    await waitForUpdate({
      lambda,
      name: 'fn',
      sleep: async (ms) => waits.push(ms),
    }),
  ).toEqual({ State: 'Active', LastUpdateStatus: 'Successful' })
  expect(waits).toEqual([500])
})

test('waitForUpdate gives up after the timeout', async () => {
  let clock = 0
  const lambda = {
    getFunction: async () => ({ LastUpdateStatus: 'InProgress' }),
  }
  await expect(
    waitForUpdate({
      lambda,
      name: 'fn',
      sleep: async () => {},
      now: () => (clock += 20_000),
      timeoutMs: 60_000,
    }),
  ).rejects.toMatchObject({
    code: 'DEV_MODE_UPDATE_TIMEOUT',
    message: expect.stringMatching(/Lambda function fn did not finish/),
  })
})

test('finding the AWS IoT Core endpoint returns it', async () => {
  const iot = {
    describeEndpoint: async () => 'abc-ats.iot.us-east-1.amazonaws.com',
  }
  expect(await findIotEndpoint({ iot, region: 'us-east-1' })).toBe(
    'abc-ats.iot.us-east-1.amazonaws.com',
  )
})

test('a region without IoT Core fails fast and names a region that has it', async () => {
  const iot = {
    describeEndpoint: async () => {
      throw dnsNotFound('iot.ap-southeast-4.amazonaws.com')
    },
  }
  const looked = []
  const lookup = async (host) => {
    looked.push(host)
    return resolvesAll()
  }
  await expect(
    findIotEndpoint({ iot, region: 'ap-southeast-4', lookup }),
  ).rejects.toMatchObject({
    code: 'DEV_MODE_REGION_NO_BROKER',
    message:
      'Dev Mode needs AWS IoT Core, which is not available in ap-southeast-4. Use a stage in a region with IoT Core, such as ap-southeast-2.',
  })
  expect(looked).toEqual(['lambda.ap-southeast-4.amazonaws.com'])
})

test('in the China partition finding the AWS IoT Core endpoint checks the amazonaws.com.cn Lambda host', async () => {
  const iot = {
    describeEndpoint: async () => {
      throw dnsNotFound('iot.cn-north-1.amazonaws.com.cn')
    },
  }
  const looked = []
  const lookup = async (host) => {
    looked.push(host)
    return resolvesAll()
  }
  await expect(
    findIotEndpoint({ iot, region: 'cn-north-1', lookup }),
  ).rejects.toMatchObject({ code: 'DEV_MODE_REGION_NO_BROKER' })
  expect(looked).toEqual(['lambda.cn-north-1.amazonaws.com.cn'])
})

test('an unresolvable IoT host in an unreachable region is reported as a network problem', async () => {
  const iot = {
    describeEndpoint: async () => {
      throw dnsNotFound('iot.eu-west-1.amazonaws.com')
    },
  }
  const lookup = async (host) => {
    throw dnsNotFound(host)
  }
  const error = await findIotEndpoint({
    iot,
    region: 'eu-west-1',
    lookup,
  }).catch((e) => e)
  expect(error.code).toBe('DEV_MODE_AWS_UNREACHABLE')
  expect(error.message).toContain('could not reach AWS in eu-west-1')
  expect(error.message).not.toContain('IoT Core')
})

test('the suggested IoT region is never the region the user is in', async () => {
  const iot = {
    describeEndpoint: async () => {
      throw dnsNotFound('iot.ap-southeast-2.amazonaws.com')
    },
  }
  const error = await findIotEndpoint({
    iot,
    region: 'ap-southeast-2',
    lookup: resolvesAll,
  }).catch((e) => e)
  expect(error.code).toBe('DEV_MODE_REGION_NO_BROKER')
  expect(error.message).toMatch(/such as us-east-1\.$/)
})

test('expired or invalid credentials are not reported as a missing IoT permission', async () => {
  for (const name of [
    'ExpiredTokenException',
    'ExpiredToken',
    'UnrecognizedClientException',
    'InvalidClientTokenId',
  ]) {
    const iot = {
      describeEndpoint: async () => {
        throw failing(name, 403)
      },
    }
    const error = await findIotEndpoint({ iot, region: 'eu-west-1' }).catch(
      (e) => e,
    )
    expect(error.code).toBe('DEV_MODE_AWS_CREDENTIALS_INVALID')
    expect(error.message).not.toContain('iot:DescribeEndpoint')
  }
})

test('an IoT UnauthorizedException names the permission', async () => {
  const iot = {
    describeEndpoint: async () => {
      throw failing('UnauthorizedException', 401)
    },
  }
  await expect(
    findIotEndpoint({ iot, region: 'eu-west-1' }),
  ).rejects.toMatchObject({ code: 'DEV_MODE_IOT_ACCESS_DENIED' })
})

test('a denied iot:DescribeEndpoint names the permission', async () => {
  const iot = {
    describeEndpoint: async () => {
      throw named('AccessDeniedException', 'not authorized')
    },
  }
  await expect(
    findIotEndpoint({ iot, region: 'eu-west-1' }),
  ).rejects.toMatchObject({ code: 'DEV_MODE_IOT_ACCESS_DENIED' })
})

test('the Lambda adapter paginates, maps 404 to null and backs off on throttles', async () => {
  let throttled = false
  const lambdaSdk = {
    async send(command) {
      if (command instanceof GetFunctionCommand) {
        if (command.input.FunctionName === 'missing')
          throw named('ResourceNotFoundException')
        if (!throttled) {
          throttled = true
          throw throttle('0')
        }
        return { Configuration: { FunctionName: command.input.FunctionName } }
      }
      if (command instanceof ListLayerVersionsCommand)
        throw named('ResourceNotFoundException')
      throw new Error(`unexpected ${command.constructor.name}`)
    },
  }
  const { lambda } = createDevModeClients({
    provider: {},
    region: 'us-east-1',
    sdk: { lambda: lambdaSdk, iam: {}, iot: {} },
    retry: { sleep: async () => {}, random: noJitter },
  })
  expect(await lambda.getFunction('api')).toEqual({ FunctionName: 'api' })
  expect(await lambda.getFunction('missing')).toBeNull()
  const versions = []
  for await (const version of lambda.listLayerVersions('serverless-dev-arm64'))
    versions.push(version)
  expect(versions).toEqual([])
})

test("getLayerVersion reads one version's content checksum; a missing version is null", async () => {
  const asked = []
  const lambdaSdk = {
    async send(command) {
      if (command instanceof GetLayerVersionCommand) {
        asked.push(command.input)
        if (command.input.VersionNumber === 9)
          throw named('ResourceNotFoundException')
        return { Version: 3, Content: { CodeSha256: 'abc=' } }
      }
      throw new Error(`unexpected ${command.constructor.name}`)
    },
  }
  const { lambda } = createDevModeClients({
    provider: {},
    region: 'us-east-1',
    sdk: { lambda: lambdaSdk, iam: {}, iot: {} },
    retry: { sleep: async () => {}, random: noJitter },
  })
  expect(await lambda.getLayerVersion('serverless-dev-arm64', 3)).toEqual({
    Version: 3,
    Content: { CodeSha256: 'abc=' },
  })
  expect(await lambda.getLayerVersion('serverless-dev-arm64', 9)).toBeNull()
  expect(asked).toEqual([
    { LayerName: 'serverless-dev-arm64', VersionNumber: 3 },
    { LayerName: 'serverless-dev-arm64', VersionNumber: 9 },
  ])
})

test('getFunctionOnce makes one attempt: a throttle is not retried, a missing function is null', async () => {
  let sends = 0
  let sleeps = 0
  const lambdaSdk = {
    async send(command) {
      sends += 1
      if (command.input.FunctionName === 'missing')
        throw named('ResourceNotFoundException')
      throw throttle('0')
    },
  }
  const { lambda } = createDevModeClients({
    provider: {},
    region: 'us-east-1',
    sdk: { lambda: lambdaSdk, iam: {}, iot: {} },
    retry: {
      sleep: async () => {
        sleeps += 1
      },
      random: noJitter,
    },
  })
  await expect(lambda.getFunctionOnce('api')).rejects.toMatchObject({
    name: 'TooManyRequestsException',
  })
  expect(await lambda.getFunctionOnce('missing')).toBeNull()
  expect(sends).toBe(2)
  expect(sleeps).toBe(0)
})

test('Lambda control-plane calls survive a DNS blip; the periodic read does not retry it', async () => {
  const blips = new Map()
  let sends = 0
  const lambdaSdk = {
    async send(command) {
      sends += 1
      const key = command.constructor.name
      if (!blips.get(key)) {
        blips.set(key, true)
        throw dnsNotFound('lambda.us-east-1.amazonaws.com')
      }
      if (command instanceof GetFunctionCommand)
        return { Configuration: { FunctionName: command.input.FunctionName } }
      if (command instanceof UpdateFunctionConfigurationCommand)
        return { RevisionId: 'r2' }
      if (command instanceof ListLayerVersionsCommand)
        return { LayerVersions: [{ Version: 1 }] }
      throw new Error(`unexpected ${key}`)
    },
  }
  const waits = []
  const { lambda } = createDevModeClients({
    provider: {},
    region: 'us-east-1',
    sdk: { lambda: lambdaSdk, iam: {}, iot: {} },
    retry: { sleep: async (ms) => waits.push(ms), random: noJitter },
  })
  expect(await lambda.getFunction('api')).toEqual({ FunctionName: 'api' })
  expect(
    await lambda.updateFunctionConfiguration({
      FunctionName: 'api',
      RevisionId: 'r1',
    }),
  ).toEqual({ RevisionId: 'r2' })
  const versions = []
  for await (const version of lambda.listLayerVersions('serverless-dev-arm64'))
    versions.push(version)
  expect(versions).toEqual([{ Version: 1 }])
  expect(waits).toEqual([250, 250, 250])

  blips.clear()
  sends = 0
  await expect(lambda.getFunctionOnce('api')).rejects.toMatchObject({
    code: 'ENOTFOUND',
  })
  expect(sends).toBe(1)
  expect(waits).toHaveLength(3)
})

test('finding the AWS IoT Core endpoint makes one attempt on ENOTFOUND and keeps classifying it', async () => {
  let sends = 0
  const iotSdk = {
    async send() {
      sends += 1
      throw dnsNotFound('iot.ap-southeast-4.amazonaws.com')
    },
  }
  const { iot } = createDevModeClients({
    provider: {},
    region: 'ap-southeast-4',
    sdk: { lambda: {}, iam: {}, iot: iotSdk },
    retry: {
      sleep: async () => {
        throw new Error('finding the AWS IoT Core endpoint must not back off')
      },
      random: noJitter,
    },
  })
  await expect(
    findIotEndpoint({ iot, region: 'ap-southeast-4', lookup: resolvesAll }),
  ).rejects.toMatchObject({ code: 'DEV_MODE_REGION_NO_BROKER' })
  expect(sends).toBe(1)

  sends = 0
  await expect(
    findIotEndpoint({
      iot,
      region: 'ap-southeast-4',
      lookup: async (host) => {
        throw dnsNotFound(host)
      },
    }),
  ).rejects.toMatchObject({ code: 'DEV_MODE_AWS_UNREACHABLE' })
  expect(sends).toBe(1)
})

test('a stale revision goes through the adapter exactly once', async () => {
  let sends = 0
  const lambdaSdk = {
    async send(command) {
      sends += 1
      if (command instanceof UpdateFunctionConfigurationCommand) {
        throw failing('PreconditionFailedException', 412)
      }
      throw new Error(`unexpected ${command.constructor.name}`)
    },
  }
  const { lambda } = createDevModeClients({
    provider: {},
    region: 'us-east-1',
    sdk: { lambda: lambdaSdk, iam: {}, iot: {} },
    retry: { sleep: async () => {}, random: noJitter },
  })
  await expect(
    lambda.updateFunctionConfiguration({
      FunctionName: 'api',
      RevisionId: 'r1',
    }),
  ).rejects.toMatchObject({ name: 'PreconditionFailedException' })
  expect(sends).toBe(1)
})

describe('iam.getRolePolicy', () => {
  const clientsWith = (send) =>
    createDevModeClients({
      provider: {},
      region: 'us-east-1',
      sdk: { lambda: {}, iam: { send }, iot: {} },
    }).iam

  test('returns the policy document URL-decoded', async () => {
    const document = JSON.stringify({
      Version: '2012-10-17',
      Statement: [{ Effect: 'Allow', Action: 'iot:Connect', Resource: '*' }],
    })
    const sent = []
    const iam = clientsWith(async (command) => {
      sent.push(command)
      return {
        RoleName: 'r',
        PolicyName: 'p',
        PolicyDocument: encodeURIComponent(document),
      }
    })
    expect(await iam.getRolePolicy('r', 'p')).toBe(document)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toBeInstanceOf(GetRolePolicyCommand)
    expect(sent[0].input).toEqual({ RoleName: 'r', PolicyName: 'p' })
  })

  test('returns null when the role has no such policy', async () => {
    const iam = clientsWith(async () => {
      throw failing('NoSuchEntityException', 404)
    })
    expect(await iam.getRolePolicy('r', 'p')).toBeNull()
  })

  test('a denial passes through for the caller to classify', async () => {
    const denied = failing('AccessDenied', 403)
    const iam = clientsWith(async () => {
      throw denied
    })
    await expect(iam.getRolePolicy('r', 'p')).rejects.toBe(denied)
  })
})

test.each([
  ['us-east-1', 'lambda.us-east-1.amazonaws.com'],
  ['cn-north-1', 'lambda.cn-north-1.amazonaws.com.cn'],
  ['us-iso-east-1', 'lambda.us-iso-east-1.c2s.ic.gov'],
  ['eusc-de-east-1', 'lambda.eusc-de-east-1.amazonaws.eu'],
])(
  'in %s, a missing IoT Core is told from a network problem by the Lambda host of its partition',
  async (region, lambdaHost) => {
    const iot = {
      describeEndpoint: async () => {
        throw dnsNotFound(`iot.${region}.example`)
      },
    }
    const looked = []
    const lookup = async (host) => {
      looked.push(host)
      return resolvesAll()
    }
    await expect(
      findIotEndpoint({ iot, region, lookup }),
    ).rejects.toMatchObject({ code: 'DEV_MODE_REGION_NO_BROKER' })
    expect(looked).toEqual([lambdaHost])
  },
)

describe('rejected credentials', () => {
  const ADVICE =
    'The credentials come from AWS profile "dev-sso": sign in again with "serverless login aws --aws-profile dev-sso" (or "serverless login aws sso" for an SSO profile) in an interactive terminal, update the profile\'s keys, or choose another profile with --aws-profile.'

  test('name where the credentials come from and how to sign in again', () => {
    const error = credentialsInvalidError(
      failing('ExpiredTokenException', 403),
      'eu-west-1',
      { source: 'profile', profile: 'dev-sso' },
    )
    expect(error.code).toBe('DEV_MODE_AWS_CREDENTIALS_INVALID')
    expect(error.message).toBe(
      `AWS rejected the credentials Dev Mode used in eu-west-1 (ExpiredTokenException). ${ADVICE}`,
    )
    expect(error.message).not.toContain('aws sso login')
  })

  test("from a call through the Framework's provider name the profile too", () => {
    const wrapped = Object.assign(new Error('wrapped'), {
      name: 'ServerlessError',
      code: 'AWS_S_T_S_GET_CALLER_IDENTITY_EXPIRED_TOKEN',
      providerError: {
        name: 'ExpiredTokenException',
        message: 'ExpiredTokenException',
        $metadata: { httpStatusCode: 403 },
      },
    })
    const error = providerCallError(wrapped, {
      region: 'eu-west-1',
      credentialSource: { source: 'profile', profile: 'dev-sso' },
      action: 'sts:GetCallerIdentity',
      why: 'to read who is running the session',
      code: 'DEV_MODE_IDENTITY_ACCESS_DENIED',
    })
    expect(error.code).toBe('DEV_MODE_AWS_CREDENTIALS_INVALID')
    expect(error.message).toBe(
      `AWS rejected the credentials Dev Mode used in eu-west-1 (ExpiredTokenException). ${ADVICE}`,
    )
  })

  test("become Dev Mode's error in the clients, naming the provider's profile", async () => {
    const expired = async () => {
      throw failing('ExpiredTokenException', 403)
    }
    const clients = createDevModeClients({
      provider: { getProfile: () => 'dev-sso' },
      region: 'eu-west-1',
      sdk: {
        lambda: { send: expired },
        iam: { send: expired },
        iot: { send: expired },
      },
    })
    const calls = [
      () => clients.lambda.getFunction('f'),
      () => clients.lambda.getFunctionOnce('f'),
      () => clients.iam.getRole('r'),
      () => clients.iot.describeEndpoint(),
    ]
    for (const call of calls) {
      const error = await call().catch((caught) => caught)
      expect(error).toMatchObject({
        code: 'DEV_MODE_AWS_CREDENTIALS_INVALID',
        message: `AWS rejected the credentials Dev Mode used in eu-west-1 (ExpiredTokenException). ${ADVICE}`,
      })
      // Still a credential error for the callers, and mapped only once.
      expect(isCredentialError(error)).toBe(true)
      expect(isAccessDenied(error)).toBe(false)
      expect(credentialsInvalidError(error, 'us-east-1')).toBe(error)
    }
    const found = await findIotEndpoint({
      iot: clients.iot,
      region: 'eu-west-1',
    }).catch((caught) => caught)
    expect(found.message).toContain(ADVICE)
  })

  test('name the source the CLI found for the run: a Dashboard Provider, not the profile', async () => {
    const expired = async () => {
      throw failing('ExpiredTokenException', 403)
    }
    const clients = createDevModeClients({
      provider: {
        getProfile: () => 'dev-sso',
        serverless: { awsCredentialSource: { source: 'dashboard' } },
      },
      region: 'eu-west-1',
      sdk: {
        lambda: { send: expired },
        iam: { send: expired },
        iot: { send: expired },
      },
    })
    const error = await clients.lambda
      .getFunction('f')
      .catch((caught) => caught)
    expect(error.message).toBe(
      "AWS rejected the credentials Dev Mode used in eu-west-1 (ExpiredTokenException). The credentials come from the org's Serverless Dashboard Provider: check that Provider's settings.",
    )
  })
})

describe('the real SDK clients', () => {
  let calls
  const provider = {
    getCredentials: async () => {
      calls += 1
      return {
        accessKeyId: `key-${calls}`,
        secretAccessKey: 'secret',
        sessionToken: 'token',
        accountId: '000000000000',
      }
    },
  }

  beforeEach(() => {
    calls = 0
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('the Lambda and Lambda Web clients make a single attempt per call', async () => {
    const clients = createSdkClients({ provider, region: 'us-east-1' })
    expect(await clients.lambda.config.maxAttempts()).toBe(1)
    expect(await clients.lambdaWeb.config.maxAttempts()).toBe(1)
  })

  test('a connection timeout ends a call to an endpoint that never connects within it, in one attempt', async () => {
    const dropped = droppedConnections()
    try {
      const clients = createSdkClients({
        provider,
        region: 'us-east-1',
        connectionTimeoutMs: 100,
      })
      const started = performance.now()
      const error = await clients.lambda
        .send(new GetFunctionCommand({ FunctionName: 'f' }))
        .catch((caught) => caught)
      expect(error.name).toBe('TimeoutError')
      expect(performance.now() - started).toBeLessThan(5_000)
      expect(dropped).toHaveBeenCalledTimes(1)
    } finally {
      dropped.mockRestore()
    }
  })

  test('Dev Mode clients given a connection timeout fail such a call once, as a network error', async () => {
    const dropped = droppedConnections()
    const retries = []
    try {
      const { lambda } = createDevModeClients({
        provider,
        region: 'us-east-1',
        connectionTimeoutMs: 100,
        retry: {
          ...PRE_COMMAND_RETRY,
          sleep: async () => {},
          onRetry: (detail) => retries.push(detail),
        },
      })
      await expect(lambda.getFunction('f')).rejects.toMatchObject({
        name: 'TimeoutError',
      })
      expect(retries).toEqual([])
      expect(dropped).toHaveBeenCalledTimes(1)
    } finally {
      dropped.mockRestore()
    }
  })

  const connectionTimeoutOf = async (client) =>
    (await client.config.requestHandler.configProvider).connectionTimeout

  test.each([
    ['directly', {}],
    ['through a proxy', { HTTPS_PROXY: 'http://127.0.0.1:3128' }],
  ])(
    'every client takes the connection timeout it is given, %s',
    async (how, env) => {
      // The timeout AWS_CLIENT_TIMEOUT sets for proxied clients stays out of this test.
      const keys = [
        ...Object.keys(env),
        'AWS_CLIENT_TIMEOUT',
        'aws_client_timeout',
      ]
      const saved = Object.fromEntries(
        keys
          .filter((key) => key in process.env)
          .map((key) => [key, process.env[key]]),
      )
      for (const key of keys) delete process.env[key]
      Object.assign(process.env, env)
      try {
        const given = createSdkClients({
          provider,
          region: 'us-east-1',
          connectionTimeoutMs: PRE_COMMAND_CONNECTION_TIMEOUT_MS,
        })
        const without = createSdkClients({ provider, region: 'us-east-1' })
        for (const name of ['lambda', 'iam', 'iot', 'lambdaWeb']) {
          expect(await connectionTimeoutOf(given[name])).toBe(
            PRE_COMMAND_CONNECTION_TIMEOUT_MS,
          )
          expect(await connectionTimeoutOf(without[name])).toBeUndefined()
        }
      } finally {
        for (const key of keys) delete process.env[key]
        Object.assign(process.env, saved)
      }
    },
  )

  test('the checks before other commands wait a few seconds for a connection', () => {
    expect(PRE_COMMAND_CONNECTION_TIMEOUT_MS).toBeGreaterThanOrEqual(3_000)
    expect(PRE_COMMAND_CONNECTION_TIMEOUT_MS).toBeLessThanOrEqual(5_000)
  })

  test('every client re-resolves credentials once they near their expiry', async () => {
    const clients = createSdkClients({ provider, region: 'us-east-1' })
    const start = Date.now()
    const clock = jest.spyOn(Date, 'now').mockReturnValue(start)
    for (const client of [
      clients.lambda,
      clients.iam,
      clients.iot,
      clients.lambdaWeb,
    ]) {
      clock.mockReturnValue(start)
      const before = calls
      const first = await client.config.credentials()
      expect(await client.config.credentials()).toBe(first)
      expect(calls).toBe(before + 1)
      expect(first).not.toHaveProperty('accountId')
      expect(first.expiration).toBeInstanceOf(Date)

      clock.mockReturnValue(start + 2 * 60_000)
      const refreshed = await client.config.credentials()
      expect(calls).toBe(before + 2)
      expect(refreshed.accessKeyId).toBe(`key-${before + 2}`)
    }
  })
})

test('withBackoff tells each retry it makes: the error, which retry and the wait', async () => {
  const retries = []
  let calls = 0
  await withBackoff(
    async () => {
      calls += 1
      if (calls < 3) throw throttle('1')
      return 'ok'
    },
    {
      sleep: async () => {},
      random: noJitter,
      onRetry: (detail) => retries.push(detail),
    },
  )
  expect(retries).toEqual([
    {
      error: expect.objectContaining({ name: 'TooManyRequestsException' }),
      retry: 1,
      retries: 7,
      delayMs: 1000,
    },
    {
      error: expect.objectContaining({ name: 'TooManyRequestsException' }),
      retry: 2,
      retries: 7,
      delayMs: 1000,
    },
  ])
})

test('a retry is made even when telling of it fails', async () => {
  let calls = 0
  const result = await withBackoff(
    async () => {
      calls += 1
      if (calls < 2) throw throttle('1')
      return 'ok'
    },
    {
      sleep: async () => {},
      random: noJitter,
      onRetry: () => {
        throw new Error('the logger is gone')
      },
    },
  )
  expect(result).toBe('ok')
  expect(calls).toBe(2)
})

test('a Lambda call Dev Mode retries leaves a debug line per retry', async () => {
  const lines = []
  let calls = 0
  const clients = createDevModeClients({
    provider: {},
    region: 'us-east-1',
    sdk: {
      lambda: {
        send: async () => {
          calls += 1
          if (calls < 3) throw throttle('1')
          return { Configuration: { FunctionName: 'svc-dev-api' } }
        },
      },
      iam: {},
      iot: {},
    },
    retry: { sleep: async () => {}, random: noJitter },
    debug: (text) => lines.push(text),
  })
  await clients.lambda.getFunction('svc-dev-api')
  expect(lines).toEqual([
    'Dev Mode retries GetFunctionCommand in 1000 ms after TooManyRequestsException (retry 1 of 7)',
    'Dev Mode retries GetFunctionCommand in 1000 ms after TooManyRequestsException (retry 2 of 7)',
  ])
})

test('by default the retry line goes to the CLI log at debug level', async () => {
  const debug = jest
    .spyOn(log.get('sls:dev'), 'debug')
    .mockImplementation(() => {})
  try {
    let calls = 0
    const clients = createDevModeClients({
      provider: {},
      region: 'us-east-1',
      sdk: {
        lambda: {
          send: async () => {
            calls += 1
            if (calls < 2) throw throttle('1')
            return { Configuration: { FunctionName: 'svc-dev-api' } }
          },
        },
        iam: {},
        iot: {},
      },
      retry: { sleep: async () => {}, random: noJitter },
    })
    await clients.lambda.getFunction('svc-dev-api')
    expect(debug.mock.calls).toEqual([
      [
        'Dev Mode retries GetFunctionCommand in 1000 ms after TooManyRequestsException (retry 1 of 7)',
      ],
    ])
  } finally {
    debug.mockRestore()
  }
})

describe('the Lambda Web adapter', () => {
  const fn = 'svc-dev-web'
  const notFound = () =>
    Object.assign(named('ResourceNotFoundException'), {
      $metadata: { httpStatusCode: 404 },
    })
  const clientsWith = (send, retry = {}) =>
    createDevModeClients({
      provider: {},
      region: 'us-east-1',
      sdk: { lambda: {}, iam: {}, iot: {}, lambdaWeb: { send } },
      retry: { sleep: async () => {}, random: noJitter, ...retry },
      debug: () => {},
    })
  const recording = (answer) => {
    const sent = []
    const send = async (command) => {
      sent.push([command.constructor.name, command.input])
      return answer(command)
    }
    return { sent, lambdaWeb: clientsWith(send).lambdaWeb }
  }
  const clock = () => {
    let t = 0
    const waits = []
    return {
      waits,
      now: () => t,
      sleep: async (ms) => {
        waits.push(ms)
        t += ms
      },
    }
  }

  test('each endpoint method sends its command with the input it names', async () => {
    const { sent, lambdaWeb } = recording(() => ({
      $metadata: { httpStatusCode: 200 },
      endpointName: 'sls-dev-fallback',
      state: 'Active',
    }))
    expect(
      await lambdaWeb.getEndpoint({
        functionName: fn,
        endpointName: 'main',
      }),
    ).toEqual({ endpointName: 'sls-dev-fallback', state: 'Active' })
    await lambdaWeb.updateEndpointWeights({
      functionName: fn,
      endpointName: 'main',
      revisionId: 'rev-dev',
    })
    await lambdaWeb.createEndpoint({
      functionName: fn,
      endpointName: 'sls-dev-fallback',
      revisionId: 'rev-clone',
      authType: 'IamAuth',
    })
    await lambdaWeb.deleteEndpoint({
      functionName: fn,
      endpointName: 'sls-dev-fallback',
    })
    expect(sent).toEqual([
      [
        'GetWebFunctionEndpointCommand',
        { functionName: fn, endpointName: 'main' },
      ],
      [
        'UpdateWebFunctionEndpointCommand',
        {
          functionName: fn,
          endpointName: 'main',
          revisionWeights: [{ revisionId: 'rev-dev', weight: 100 }],
        },
      ],
      [
        'CreateWebFunctionEndpointCommand',
        {
          functionName: fn,
          endpointName: 'sls-dev-fallback',
          endpointType: 'HomeRegion',
          authType: 'IamAuth',
          autoDeploymentMode: 'Disabled',
          revisionWeights: [{ revisionId: 'rev-clone', weight: 100 }],
        },
      ],
      [
        'DeleteWebFunctionEndpointCommand',
        { functionName: fn, endpointName: 'sls-dev-fallback' },
      ],
    ])
  })

  test('each revision method sends its command with the input it names', async () => {
    const buildConfig = {
      codeConfig: { s3Object: { bucket: 'b', key: 'k' } },
      runtimeConfig: { runtime: 'nodejs24.x' },
    }
    const serviceConfig = {
      executionRoleArn: 'arn:aws:iam::000000000000:role/r',
      environmentVariables: { SLS_DEV_SESSION: 's1' },
    }
    const { sent, lambdaWeb } = recording((command) =>
      command instanceof CreateWebFunctionRevisionCommand
        ? { revisionId: 'rev-new', state: 'Pending' }
        : { revisionId: 'rev-new', state: 'Active' },
    )
    expect(
      await lambdaWeb.createRevision({
        functionName: fn,
        description: 'Serverless Dev Mode bridge for session s1',
        kmsKeyArn: 'arn:aws:kms:us-east-1:000000000000:key/k',
        buildConfig,
        serviceConfig,
      }),
    ).toEqual({ revisionId: 'rev-new', state: 'Pending' })
    expect(
      await lambdaWeb.getRevision({ functionName: fn, revisionId: 'rev-new' }),
    ).toEqual({ revisionId: 'rev-new', state: 'Active' })
    await lambdaWeb.deleteRevision({ functionName: fn, revisionId: 'rev-new' })
    expect(sent).toEqual([
      [
        'CreateWebFunctionRevisionCommand',
        {
          functionName: fn,
          description: 'Serverless Dev Mode bridge for session s1',
          kmsKeyArn: 'arn:aws:kms:us-east-1:000000000000:key/k',
          buildConfig,
          serviceConfig,
        },
      ],
      [
        'GetWebFunctionRevisionCommand',
        { functionName: fn, revisionId: 'rev-new' },
      ],
      [
        'DeleteWebFunctionRevisionCommand',
        { functionName: fn, revisionId: 'rev-new' },
      ],
    ])
  })

  test('a missing endpoint or revision reads as null; deleting one that is gone reports false', async () => {
    const { lambdaWeb } = recording((command) => {
      if (
        command instanceof GetWebFunctionEndpointCommand ||
        command instanceof GetWebFunctionRevisionCommand ||
        command instanceof DeleteWebFunctionEndpointCommand ||
        command instanceof DeleteWebFunctionRevisionCommand
      )
        throw notFound()
      throw new Error(`unexpected ${command.constructor.name}`)
    })
    expect(
      await lambdaWeb.getEndpoint({ functionName: fn, endpointName: 'x' }),
    ).toBeNull()
    expect(
      await lambdaWeb.getRevision({ functionName: fn, revisionId: 'x' }),
    ).toBeNull()
    expect(
      await lambdaWeb.deleteEndpoint({ functionName: fn, endpointName: 'x' }),
    ).toBe(false)
    expect(
      await lambdaWeb.deleteRevision({ functionName: fn, revisionId: 'x' }),
    ).toBe(false)
  })

  test('a delete that succeeds reports true; a conflict is passed on', async () => {
    const { lambdaWeb } = recording((command) => {
      if (command instanceof DeleteWebFunctionRevisionCommand)
        throw failing('ConflictException', 409)
      return {}
    })
    expect(
      await lambdaWeb.deleteEndpoint({ functionName: fn, endpointName: 'e' }),
    ).toBe(true)
    await expect(
      lambdaWeb.deleteRevision({ functionName: fn, revisionId: 'r' }),
    ).rejects.toMatchObject({ name: 'ConflictException' })
  })

  test('the list methods follow every page to the end', async () => {
    const { sent, lambdaWeb } = recording((command) => {
      const token = command.input.nextToken
      if (command instanceof ListWebFunctionEndpointsCommand)
        return token
          ? { endpoints: [{ endpointName: 'sls-dev-local' }] }
          : { endpoints: [{ endpointName: 'main' }], nextToken: 'e2' }
      if (command instanceof ListWebFunctionRevisionsCommand) {
        if (!token)
          return { revisions: [{ revisionId: 'r1' }], nextToken: 'r2' }
        if (token === 'r2') return { revisions: [], nextToken: 'r3' }
        return { revisions: [{ revisionId: 'r3' }] }
      }
      throw new Error(`unexpected ${command.constructor.name}`)
    })
    expect(await lambdaWeb.listEndpoints({ functionName: fn })).toEqual([
      { endpointName: 'main' },
      { endpointName: 'sls-dev-local' },
    ])
    expect(await lambdaWeb.listRevisions({ functionName: fn })).toEqual([
      { revisionId: 'r1' },
      { revisionId: 'r3' },
    ])
    expect(sent).toEqual([
      [
        'ListWebFunctionEndpointsCommand',
        { functionName: fn, nextToken: undefined },
      ],
      [
        'ListWebFunctionEndpointsCommand',
        { functionName: fn, nextToken: 'e2' },
      ],
      [
        'ListWebFunctionRevisionsCommand',
        { functionName: fn, nextToken: undefined },
      ],
      [
        'ListWebFunctionRevisionsCommand',
        { functionName: fn, nextToken: 'r2' },
      ],
      [
        'ListWebFunctionRevisionsCommand',
        { functionName: fn, nextToken: 'r3' },
      ],
    ])
  })

  test('listing a web function that is gone returns no items', async () => {
    const { lambdaWeb } = recording(() => {
      throw notFound()
    })
    expect(await lambdaWeb.listEndpoints({ functionName: fn })).toEqual([])
    expect(await lambdaWeb.listRevisions({ functionName: fn })).toEqual([])
  })

  test('calls share the Lambda retry policy and its debug line', async () => {
    let calls = 0
    const waits = []
    const lines = []
    const { lambdaWeb } = createDevModeClients({
      provider: {},
      region: 'us-east-1',
      sdk: {
        lambda: {},
        iam: {},
        iot: {},
        lambdaWeb: {
          send: async () => {
            calls += 1
            if (calls === 1)
              throw Object.assign(named('ThrottlingException'), {
                retryAfterSeconds: 2,
                $metadata: { httpStatusCode: 429 },
              })
            if (calls === 2) throw withCode('ECONNRESET')
            return { endpointName: 'main' }
          },
        },
      },
      retry: { sleep: async (ms) => waits.push(ms), random: noJitter },
      debug: (text) => lines.push(text),
    })
    expect(
      await lambdaWeb.getEndpoint({ functionName: fn, endpointName: 'main' }),
    ).toEqual({ endpointName: 'main' })
    expect(waits).toEqual([2000, 500])
    expect(lines[0]).toBe(
      'Dev Mode retries GetWebFunctionEndpointCommand in 2000 ms after ThrottlingException (retry 1 of 7)',
    )
  })

  test('the single-attempt reads of the periodic check never retry; missing reads as null', async () => {
    let calls = 0
    const { sent, lambdaWeb } = recording((command) => {
      calls += 1
      if (command.input.endpointName === 'gone') throw notFound()
      throw Object.assign(named('ThrottlingException'), {
        $metadata: { httpStatusCode: 429 },
      })
    })
    await expect(
      lambdaWeb.getEndpointOnce({ functionName: fn, endpointName: 'main' }),
    ).rejects.toThrow()
    await expect(
      lambdaWeb.getRevisionOnce({ functionName: fn, revisionId: 'rev-1' }),
    ).rejects.toThrow()
    expect(calls).toBe(2)
    expect(
      await lambdaWeb.getEndpointOnce({
        functionName: fn,
        endpointName: 'gone',
      }),
    ).toBeNull()
    expect(sent.map(([name, input]) => [name, input])).toEqual([
      [
        'GetWebFunctionEndpointCommand',
        { functionName: fn, endpointName: 'main' },
      ],
      [
        'GetWebFunctionRevisionCommand',
        { functionName: fn, revisionId: 'rev-1' },
      ],
      [
        'GetWebFunctionEndpointCommand',
        { functionName: fn, endpointName: 'gone' },
      ],
    ])
  })

  test('rejected credentials become the Dev Mode credentials error', async () => {
    const { lambdaWeb } = recording(() => {
      throw Object.assign(named('ExpiredTokenException'), {
        $metadata: { httpStatusCode: 403 },
      })
    })
    await expect(
      lambdaWeb.listRevisions({ functionName: fn }),
    ).rejects.toMatchObject({ code: 'DEV_MODE_AWS_CREDENTIALS_INVALID' })
  })

  describe('waitRevisionActive', () => {
    test('polls every second until the revision is Active', async () => {
      const states = ['Pending', 'Pending', 'Active']
      const { sent, lambdaWeb } = recording(() => ({
        revisionId: 'rev-new',
        state: states.shift(),
      }))
      const c = clock()
      expect(
        await lambdaWeb.waitRevisionActive({
          functionName: fn,
          revisionId: 'rev-new',
          sleep: c.sleep,
          now: c.now,
        }),
      ).toEqual({ revisionId: 'rev-new', state: 'Active' })
      expect(c.waits).toEqual([1000, 1000])
      expect(sent.map(([name]) => name)).toEqual([
        'GetWebFunctionRevisionCommand',
        'GetWebFunctionRevisionCommand',
        'GetWebFunctionRevisionCommand',
      ])
    })

    test('a Failed revision throws DEV_MODE_REVISION_FAILED with its first error', async () => {
      const { lambdaWeb } = recording(() => ({
        revisionId: 'rev-new',
        state: 'Failed',
        stateReason: 'Revision creation failed',
        errors: [
          {
            attribute: 'serviceConfig.executionRoleArn',
            errorCode: 'InvalidRole',
            errorMessage: 'The role cannot be assumed by Lambda.',
          },
        ],
      }))
      const c = clock()
      const error = await lambdaWeb
        .waitRevisionActive({
          functionName: fn,
          revisionId: 'rev-new',
          sleep: c.sleep,
          now: c.now,
        })
        .catch((caught) => caught)
      expect(error.code).toBe('DEV_MODE_REVISION_FAILED')
      expect(error.message).toContain('The role cannot be assumed by Lambda.')
      expect(error.message).toContain('rev-new')
      expect(c.waits).toEqual([])
    })

    test('a Failed revision without errors names its state reason', async () => {
      const { lambdaWeb } = recording(() => ({
        revisionId: 'rev-new',
        state: 'Failed',
        stateReason: 'Internal failure',
      }))
      await expect(
        lambdaWeb.waitRevisionActive({
          functionName: fn,
          revisionId: 'rev-new',
          ...clock(),
        }),
      ).rejects.toMatchObject({
        code: 'DEV_MODE_REVISION_FAILED',
        message: expect.stringContaining('Internal failure'),
      })
    })

    test('a revision still Pending after the timeout throws DEV_MODE_REVISION_TIMEOUT', async () => {
      const { sent, lambdaWeb } = recording(() => ({
        revisionId: 'rev-new',
        state: 'Pending',
      }))
      const c = clock()
      await expect(
        lambdaWeb.waitRevisionActive({
          functionName: fn,
          revisionId: 'rev-new',
          timeoutMs: 5_000,
          sleep: c.sleep,
          now: c.now,
        }),
      ).rejects.toMatchObject({ code: 'DEV_MODE_REVISION_TIMEOUT' })
      expect(c.waits.every((ms) => ms === 1000)).toBe(true)
      expect(c.now()).toBeGreaterThanOrEqual(5_000)
      expect(c.now()).toBeLessThanOrEqual(6_000)
      expect(sent.length).toBeLessThanOrEqual(7)
    })

    test('the default timeout is a minute', async () => {
      const { lambdaWeb } = recording(() => ({ state: 'Pending' }))
      const c = clock()
      await expect(
        lambdaWeb.waitRevisionActive({
          functionName: fn,
          revisionId: 'rev-new',
          sleep: c.sleep,
          now: c.now,
        }),
      ).rejects.toMatchObject({ code: 'DEV_MODE_REVISION_TIMEOUT' })
      expect(c.now()).toBeGreaterThanOrEqual(60_000)
      expect(c.now()).toBeLessThanOrEqual(61_000)
    })

    test('a revision not visible yet is polled again', async () => {
      let reads = 0
      const { lambdaWeb } = recording(() => {
        reads += 1
        if (reads === 1) throw notFound()
        return { revisionId: 'rev-new', state: 'Active' }
      })
      expect(
        await lambdaWeb.waitRevisionActive({
          functionName: fn,
          revisionId: 'rev-new',
          ...clock(),
        }),
      ).toMatchObject({ state: 'Active' })
      expect(reads).toBe(2)
    })

    test('a revision missing for longer than five seconds throws DEV_MODE_REVISION_NOT_FOUND', async () => {
      const { lambdaWeb } = recording(() => {
        throw notFound()
      })
      const c = clock()
      await expect(
        lambdaWeb.waitRevisionActive({
          functionName: fn,
          revisionId: 'rev-gone',
          sleep: c.sleep,
          now: c.now,
        }),
      ).rejects.toMatchObject({
        code: 'DEV_MODE_REVISION_NOT_FOUND',
        message: expect.stringContaining('rev-gone'),
      })
      expect(c.now()).toBeGreaterThanOrEqual(5_000)
      expect(c.now()).toBeLessThanOrEqual(6_000)
    })

    test('a revision that disappears while Pending fails five seconds after it went', async () => {
      let reads = 0
      const { lambdaWeb } = recording(() => {
        reads += 1
        if (reads <= 10) return { revisionId: 'rev-new', state: 'Pending' }
        throw notFound()
      })
      const c = clock()
      await expect(
        lambdaWeb.waitRevisionActive({
          functionName: fn,
          revisionId: 'rev-new',
          sleep: c.sleep,
          now: c.now,
        }),
      ).rejects.toMatchObject({ code: 'DEV_MODE_REVISION_NOT_FOUND' })
      expect(c.now()).toBeGreaterThanOrEqual(15_000)
      expect(c.now()).toBeLessThanOrEqual(16_000)
    })
  })

  describe('waitEndpointActive', () => {
    test('an endpoint being deleted throws DEV_MODE_ENDPOINT_DELETING at once', async () => {
      const { lambdaWeb } = recording(() => ({ state: 'Deleting' }))
      const c = clock()
      await expect(
        lambdaWeb.waitEndpointActive({
          functionName: fn,
          endpointName: 'sls-dev-fallback',
          sleep: c.sleep,
          now: c.now,
        }),
      ).rejects.toMatchObject({
        code: 'DEV_MODE_ENDPOINT_DELETING',
        message: expect.stringContaining('sls-dev-fallback'),
      })
      expect(c.waits).toEqual([])
    })

    test('an endpoint missing for longer than five seconds throws DEV_MODE_ENDPOINT_NOT_FOUND', async () => {
      const { lambdaWeb } = recording(() => {
        throw notFound()
      })
      const c = clock()
      await expect(
        lambdaWeb.waitEndpointActive({
          functionName: fn,
          endpointName: 'sls-dev-fallback',
          sleep: c.sleep,
          now: c.now,
        }),
      ).rejects.toMatchObject({ code: 'DEV_MODE_ENDPOINT_NOT_FOUND' })
      expect(c.now()).toBeLessThanOrEqual(6_000)
    })

    test('waits until the endpoint is Active and no update is in progress', async () => {
      const answers = [
        { state: 'Pending' },
        { state: 'Active', updateStatus: 'InProgress' },
        { state: 'Active', updateStatus: 'Successful' },
      ]
      const { sent, lambdaWeb } = recording(() => answers.shift())
      const c = clock()
      expect(
        await lambdaWeb.waitEndpointActive({
          functionName: fn,
          endpointName: 'sls-dev-fallback',
          sleep: c.sleep,
          now: c.now,
        }),
      ).toEqual({ state: 'Active', updateStatus: 'Successful' })
      expect(c.waits).toEqual([1000, 1000])
      expect(sent[0]).toEqual([
        'GetWebFunctionEndpointCommand',
        { functionName: fn, endpointName: 'sls-dev-fallback' },
      ])
    })

    test('a Failed endpoint or update throws DEV_MODE_ENDPOINT_FAILED with its reason', async () => {
      for (const answer of [
        { state: 'Failed', stateReason: 'Endpoint creation failed' },
        {
          state: 'Active',
          updateStatus: 'Failed',
          updateStatusReason: 'Endpoint creation failed',
        },
      ]) {
        const { lambdaWeb } = recording(() => answer)
        await expect(
          lambdaWeb.waitEndpointActive({
            functionName: fn,
            endpointName: 'sls-dev-fallback',
            ...clock(),
          }),
        ).rejects.toMatchObject({
          code: 'DEV_MODE_ENDPOINT_FAILED',
          message: expect.stringContaining('Endpoint creation failed'),
        })
      }
    })

    test('an endpoint still Pending after the timeout throws DEV_MODE_ENDPOINT_TIMEOUT', async () => {
      const { lambdaWeb } = recording(() => ({ state: 'Pending' }))
      const c = clock()
      await expect(
        lambdaWeb.waitEndpointActive({
          functionName: fn,
          endpointName: 'sls-dev-fallback',
          timeoutMs: 3_000,
          sleep: c.sleep,
          now: c.now,
        }),
      ).rejects.toMatchObject({ code: 'DEV_MODE_ENDPOINT_TIMEOUT' })
      expect(c.now()).toBeGreaterThanOrEqual(3_000)
      expect(c.now()).toBeLessThanOrEqual(4_000)
    })
  })
})
