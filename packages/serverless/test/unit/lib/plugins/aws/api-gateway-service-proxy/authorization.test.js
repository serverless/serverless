import { jest } from '@jest/globals'

jest.unstable_mockModule('@serverless/util', () => ({
  getOrCreateGlobalDeploymentBucket: jest.fn(),
  log: {
    debug: jest.fn(),
    warning: jest.fn(),
    notice: jest.fn(),
    get: jest.fn(() => ({
      debug: jest.fn(),
      warning: jest.fn(),
      notice: jest.fn(),
    })),
  },
  progress: { get: jest.fn() },
  style: { aside: jest.fn() },
  writeText: jest.fn(),
  ServerlessError: class ServerlessError extends Error {
    constructor(message, code) {
      super(message)
      this.code = code
    }
  },
  ServerlessErrorCodes: { general: { INVALID_CONFIG: 'INVALID_CONFIG' } },
  addProxyToAwsClient: jest.fn((client) => client),
  stringToSafeColor: jest.fn((str) => str),
  getPluginWriters: jest.fn(() => ({})),
  getPluginConstructors: jest.fn(() => ({})),
  write: jest.fn(),
}))

const { default: Serverless } =
  await import('../../../../../../lib/serverless.js')
const { default: AwsProvider } =
  await import('../../../../../../lib/plugins/aws/provider.js')
const { default: ServiceProxies } =
  await import('../../../../../../lib/plugins/aws/api-gateway-service-proxy/index.js')

const JWT_AUTHORIZER = { Ref: 'OrdersApiGatewayJwtAuthorizer' }

// One proxy of each kind, all carrying the same authorization keys, so every
// `compileMethodsTo*` is shown to pass them through.
const proxiesWith = (authorization) => [
  { sqs: { path: '/sqs', method: 'post', queueName: 'q', ...authorization } },
  {
    kinesis: {
      path: '/kinesis',
      method: 'post',
      streamName: 's',
      ...authorization,
    },
  },
  {
    sns: { path: '/sns', method: 'post', topicName: 't', ...authorization },
  },
  {
    s3: {
      path: '/s3',
      method: 'get',
      action: 'GetObject',
      bucket: 'b',
      key: 'k',
      ...authorization,
    },
  },
  {
    dynamodb: {
      path: '/dynamodb/{id}',
      method: 'get',
      action: 'GetItem',
      tableName: 't',
      hashKey: { pathParam: 'id', attributeType: 'S' },
      ...authorization,
    },
  },
  {
    eventbridge: {
      path: '/eventbridge',
      method: 'post',
      eventBusName: 'bus',
      source: 'acme',
      ...authorization,
    },
  },
]

const compile = async (proxies) => {
  const options = { stage: 'dev', region: 'us-east-1' }
  const serverless = new Serverless({ commands: [], options: {} })
  serverless.credentialProviders = { aws: { getCredentials: jest.fn() } }
  serverless.setProvider('aws', new AwsProvider(serverless, options))
  serverless.service.service = 'proxy-service'
  serverless.service.custom = { apiGatewayServiceProxies: proxies }
  serverless.service.provider.compiledCloudFormationTemplate = {
    Resources: {},
    Outputs: {},
  }
  const plugin = new ServiceProxies(serverless, options)
  await plugin.hooks['package:compileEvents']()
  return serverless.service.provider.compiledCloudFormationTemplate.Resources
}

const methodsOf = (resources) =>
  Object.values(resources).filter(
    (resource) => resource.Type === 'AWS::ApiGateway::Method',
  )

describe('API Gateway service proxies - authorization', () => {
  it('attaches a JWT authorizer by id, with scopes, on every proxy kind', async () => {
    const methods = methodsOf(
      await compile(
        proxiesWith({
          authorizationType: 'JWT',
          authorizerId: JWT_AUTHORIZER,
          authorizationScopes: ['orders:write'],
        }),
      ),
    )

    expect(methods).toHaveLength(6)
    for (const method of methods) {
      expect(method.Properties).toMatchObject({
        AuthorizationType: 'JWT',
        AuthorizerId: JWT_AUTHORIZER,
        AuthorizationScopes: ['orders:write'],
      })
    }
  })

  it('attaches a JWT authorizer by a literal id, without scopes', async () => {
    const [method] = methodsOf(
      await compile([
        {
          sqs: {
            path: '/sqs',
            method: 'post',
            queueName: 'q',
            authorizationType: 'JWT',
            authorizerId: 'abc123',
          },
        },
      ]),
    )

    expect(method.Properties.AuthorizationType).toBe('JWT')
    expect(method.Properties.AuthorizerId).toBe('abc123')
    expect(method.Properties.AuthorizationScopes).toBeUndefined()
  })

  // A JWT method checks tokens with an authorizer resource, so it has to name
  // one.
  it.each([
    ['without an authorizerId', { authorizationType: 'JWT' }],
    [
      'with scopes but no authorizerId',
      { authorizationType: 'JWT', authorizationScopes: ['orders:write'] },
    ],
  ])('rejects JWT %s', async (_label, authorization) => {
    await expect(
      compile([
        {
          sqs: {
            path: '/sqs',
            method: 'post',
            queueName: 'q',
            ...authorization,
          },
        },
      ]),
    ).rejects.toThrow(/authorizationType/)
  })

  // Unchanged: what each existing type accepts.
  it.each([
    [{ authorizationType: 'CUSTOM', authorizerId: 'abc123' }],
    [
      {
        authorizationType: 'COGNITO_USER_POOLS',
        authorizerId: 'abc123',
        authorizationScopes: ['email'],
      },
    ],
    [{ authorizationType: 'AWS_IAM' }],
    [{}],
  ])('still accepts %p', async (authorization) => {
    const [method] = methodsOf(
      await compile([
        {
          sqs: {
            path: '/sqs',
            method: 'post',
            queueName: 'q',
            ...authorization,
          },
        },
      ]),
    )
    expect(method.Properties.AuthorizationType).toBe(
      authorization.authorizationType ?? 'NONE',
    )
  })

  it('still rejects scopes without an authorizerId for a non-Cognito type', async () => {
    await expect(
      compile([
        {
          sqs: {
            path: '/sqs',
            method: 'post',
            queueName: 'q',
            authorizationType: 'AWS_IAM',
            authorizationScopes: ['email'],
          },
        },
      ]),
    ).rejects.toThrow(/authorizationType/)
  })
})
