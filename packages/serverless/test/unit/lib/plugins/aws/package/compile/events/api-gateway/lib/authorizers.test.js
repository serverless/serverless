import { jest } from '@jest/globals'

// Mock Utils
jest.unstable_mockModule('@serverless/util', () => ({
  getOrCreateGlobalDeploymentBucket: jest.fn(),
  log: {
    debug: jest.fn(),
    get: jest.fn(() => ({ debug: jest.fn(), warning: jest.fn() })),
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
  ServerlessErrorCodes: { INVALID_CONFIG: 'INVALID_CONFIG' },
  addProxyToAwsClient: jest.fn((client) => client),
  stringToSafeColor: jest.fn((str) => str),
  getPluginWriters: jest.fn(() => ({})),
  getPluginConstructors: jest.fn(() => ({})),
  write: jest.fn(),
}))

const { default: Serverless } = await import(
  '../../../../../../../../../../lib/serverless.js'
)
const { default: AwsProvider } = await import(
  '../../../../../../../../../../lib/plugins/aws/provider.js'
)
const { default: AwsCompileApigEvents } = await import(
  '../../../../../../../../../../lib/plugins/aws/package/compile/events/api-gateway/index.js'
)

describe('#compileAuthorizers()', () => {
  let serverless
  let awsCompileApigEvents
  let options

  beforeEach(() => {
    options = { stage: 'dev', region: 'us-east-1' }
    serverless = new Serverless({ commands: [], options: {} })
    serverless.credentialProviders = {
      aws: { getCredentials: jest.fn() },
    }
    serverless.setProvider('aws', new AwsProvider(serverless, options))
    serverless.service.service = 'first-service'
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
    }
    awsCompileApigEvents = new AwsCompileApigEvents(serverless, options)
    awsCompileApigEvents.apiGatewayRestApiLogicalId = 'ApiGatewayRestApi'
    awsCompileApigEvents.validated = {}
  })

  it('should create an authorizer with minimal configuration', () => {
    awsCompileApigEvents.validated.events = [
      {
        http: {
          path: 'users/create',
          method: 'POST',
          authorizer: {
            name: 'authorizer',
            arn: { 'Fn::GetAtt': ['SomeLambdaFunction', 'Arn'] },
            resultTtlInSeconds: 300,
            identitySource: 'method.request.header.Authorization',
          },
        },
      },
    ]

    awsCompileApigEvents.compileAuthorizers()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources
    const resource = resources.AuthorizerApiGatewayAuthorizer

    expect(resource.Type).toBe('AWS::ApiGateway::Authorizer')
    expect(resource.Properties.AuthorizerResultTtlInSeconds).toBe(300)
    expect(resource.Properties.IdentitySource).toBe(
      'method.request.header.Authorization',
    )
    expect(resource.Properties.Name).toBe('authorizer')
    expect(resource.Properties.RestApiId.Ref).toBe('ApiGatewayRestApi')
    expect(resource.Properties.Type).toBe('TOKEN')
  })

  it('should create an authorizer with provided configuration', () => {
    awsCompileApigEvents.validated.events = [
      {
        http: {
          path: 'users/create',
          method: 'POST',
          authorizer: {
            name: 'authorizer',
            arn: 'foo',
            resultTtlInSeconds: 500,
            identitySource: 'method.request.header.Custom',
            identityValidationExpression: 'regex',
          },
        },
      },
    ]

    awsCompileApigEvents.compileAuthorizers()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources
    const resource = resources.AuthorizerApiGatewayAuthorizer

    expect(resource.Type).toBe('AWS::ApiGateway::Authorizer')
    expect(resource.Properties.AuthorizerResultTtlInSeconds).toBe(500)
    expect(resource.Properties.IdentitySource).toBe(
      'method.request.header.Custom',
    )
    expect(resource.Properties.IdentityValidationExpression).toBe('regex')
  })

  it('should apply optional provided type value to Authorizer Type', () => {
    awsCompileApigEvents.validated.events = [
      {
        http: {
          path: 'users/create',
          method: 'POST',
          authorizer: {
            name: 'authorizer',
            arn: { 'Fn::GetAtt': ['SomeLambdaFunction', 'Arn'] },
            resultTtlInSeconds: 300,
            identitySource: 'method.request.header.Authorization',
            type: 'request',
          },
        },
      },
    ]

    awsCompileApigEvents.compileAuthorizers()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources
    const resource = resources.AuthorizerApiGatewayAuthorizer

    expect(resource.Properties.Type).toBe('REQUEST')
  })

  it('should apply TOKEN as authorizer Type when not given a type value', () => {
    awsCompileApigEvents.validated.events = [
      {
        http: {
          path: 'users/create',
          method: 'POST',
          authorizer: {
            name: 'authorizer',
            arn: { 'Fn::GetAtt': ['SomeLambdaFunction', 'Arn'] },
            resultTtlInSeconds: 300,
            identitySource: 'method.request.header.Authorization',
          },
        },
      },
    ]

    awsCompileApigEvents.compileAuthorizers()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources
    const resource = resources.AuthorizerApiGatewayAuthorizer

    expect(resource.Properties.Type).toBe('TOKEN')
  })

  it('should create a valid cognito user pool authorizer', () => {
    awsCompileApigEvents.validated.events = [
      {
        http: {
          path: 'users/create',
          method: 'POST',
          authorizer: {
            name: 'authorizer',
            arn: 'arn:aws:cognito-idp:us-east-1:xxx:userpool/us-east-1_ZZZ',
            type: 'COGNITO_USER_POOLS',
          },
        },
      },
    ]

    awsCompileApigEvents.compileAuthorizers()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources
    const resource = resources.AuthorizerApiGatewayAuthorizer

    expect(resource.Type).toBe('AWS::ApiGateway::Authorizer')
    expect(resource.Properties.Type).toBe('COGNITO_USER_POOLS')
    expect(resource.Properties.ProviderARNs).toEqual([
      'arn:aws:cognito-idp:us-east-1:xxx:userpool/us-east-1_ZZZ',
    ])
  })

  it('should create a valid cognito user pool authorizer using Fn::GetAtt', () => {
    awsCompileApigEvents.validated.events = [
      {
        http: {
          path: 'users/create',
          method: 'POST',
          authorizer: {
            name: 'authorizer',
            arn: { 'Fn::GetAtt': ['CognitoUserPool', 'Arn'] },
            type: 'COGNITO_USER_POOLS',
          },
        },
      },
    ]

    awsCompileApigEvents.compileAuthorizers()
    const resources =
      serverless.service.provider.compiledCloudFormationTemplate.Resources
    const resource = resources.AuthorizerApiGatewayAuthorizer

    expect(resource.Type).toBe('AWS::ApiGateway::Authorizer')
    expect(resource.Properties.Type).toBe('COGNITO_USER_POOLS')
    expect(resource.Properties.ProviderARNs).toEqual([
      { 'Fn::GetAtt': ['CognitoUserPool', 'Arn'] },
    ])
  })
})
