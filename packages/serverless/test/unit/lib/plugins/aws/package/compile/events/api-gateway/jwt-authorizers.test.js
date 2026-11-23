import { jest } from '@jest/globals'

// Mock Utils
jest.unstable_mockModule('@serverless/util', () => ({
  getOrCreateGlobalDeploymentBucket: jest.fn(),
  log: {
    debug: jest.fn(),
    warning: jest.fn(),
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

const { default: Serverless } =
  await import('../../../../../../../../../lib/serverless.js')
const { default: AwsProvider } =
  await import('../../../../../../../../../lib/plugins/aws/provider.js')
const { default: AwsCompileApigEvents } =
  await import('../../../../../../../../../lib/plugins/aws/package/compile/events/api-gateway/index.js')

const ISSUER = 'https://idp.example.com/'

const ordersAuthorizer = (overrides = {}) => ({
  type: 'jwt',
  algorithms: ['RS256'],
  issuerUrl: ISSUER,
  audience: 'api://orders',
  ...overrides,
})

describe('API Gateway JWT authorizers', () => {
  let serverless
  let plugin

  beforeEach(() => {
    const options = { stage: 'dev', region: 'us-east-1' }
    serverless = new Serverless({ commands: [], options: {} })
    serverless.credentialProviders = { aws: { getCredentials: jest.fn() } }
    serverless.setProvider('aws', new AwsProvider(serverless, options))
    serverless.service.service = 'jwt-service'
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
      Outputs: {},
    }
    plugin = new AwsCompileApigEvents(serverless, options)
  })

  /**
   * Runs the plugin's package hook over a service with the given
   * `provider.apiGateway` and functions, and returns the compiled resources.
   */
  const compile = async ({ apiGateway, functions, custom }) => {
    serverless.service.provider.apiGateway = apiGateway
    serverless.service.functions = functions
    if (custom) serverless.service.custom = custom
    for (const [name, fn] of Object.entries(functions)) {
      fn.handler ??= `handler.${name}`
      fn.events ??= []
    }
    await plugin.hooks['package:compileEvents']()
    return serverless.service.provider.compiledCloudFormationTemplate.Resources
  }

  const compileError = async (config) => {
    try {
      await compile(config)
    } catch (error) {
      return error
    }
    throw new Error('Expected compilation to fail')
  }

  const withEvent = (authorizer, http = {}) => ({
    list: {
      events: [
        { http: { path: 'orders', method: 'get', authorizer, ...http } },
      ],
    },
  })

  describe('authorizer definitions', () => {
    it('compiles a single-issuer authorizer', async () => {
      const resources = await compile({
        apiGateway: { authorizers: { orders: ordersAuthorizer() } },
        functions: withEvent('orders'),
      })

      expect(resources.OrdersApiGatewayJwtAuthorizer).toEqual({
        Type: 'AWS::ApiGateway::Authorizer',
        Properties: {
          RestApiId: { Ref: 'ApiGatewayRestApi' },
          Name: 'orders',
          Type: 'JWT',
          IdentitySource: 'method.request.header.Authorization',
          JwtConfiguration: {
            DefaultAlgorithms: ['RS256'],
            Issuers: [{ Issuer: ISSUER, Audiences: ['api://orders'] }],
          },
        },
      })
    })

    it('emits no TTL, function URI, DependsOn or Lambda permission', async () => {
      const resources = await compile({
        apiGateway: { authorizers: { orders: ordersAuthorizer() } },
        functions: withEvent('orders'),
      })

      const authorizer = resources.OrdersApiGatewayJwtAuthorizer
      expect(authorizer.DependsOn).toBeUndefined()
      expect(authorizer.Properties).not.toHaveProperty(
        'AuthorizerResultTtlInSeconds',
      )
      expect(authorizer.Properties).not.toHaveProperty('AuthorizerUri')
      expect(resources).not.toHaveProperty('OrdersApiGatewayAuthorizer')
      const permissions = Object.entries(resources)
        .filter(([, resource]) => resource.Type === 'AWS::Lambda::Permission')
        .map(([logicalId]) => logicalId)
      expect(permissions).toEqual(['ListLambdaPermissionApiGateway'])
    })

    it('compiles a multi-issuer authorizer with every claim form', async () => {
      const resources = await compile({
        apiGateway: {
          authorizers: {
            orders: {
              type: 'JWT',
              name: 'orders-api',
              identitySource: 'method.request.header.X-Token',
              algorithms: ['rs256', 'Es384'],
              issuers: [
                { issuerUrl: 'https://a.example.com', audience: ['a1', 'a2'] },
                {
                  issuerUrl: 'https://b.example.com/tenant',
                  audience: 'b1',
                  additionalClaims: {
                    tenant: 'acme',
                    department: true,
                    tier: { value: 'gold', required: false },
                    region: { value: 'eu' },
                  },
                },
              ],
            },
          },
        },
        functions: withEvent('orders'),
      })

      expect(resources.OrdersApiGatewayJwtAuthorizer.Properties).toEqual({
        RestApiId: { Ref: 'ApiGatewayRestApi' },
        Name: 'orders-api',
        Type: 'JWT',
        IdentitySource: 'method.request.header.X-Token',
        JwtConfiguration: {
          DefaultAlgorithms: ['RS256', 'ES384'],
          Issuers: [
            { Issuer: 'https://a.example.com', Audiences: ['a1', 'a2'] },
            {
              Issuer: 'https://b.example.com/tenant',
              Audiences: ['b1'],
              AdditionalClaims: [
                {
                  ClaimName: 'tenant',
                  Format: 'SINGLE_STRING',
                  Required: true,
                  ExpectedValues: ['acme'],
                },
                {
                  ClaimName: 'department',
                  Format: 'SINGLE_STRING',
                  Required: true,
                },
                {
                  ClaimName: 'tier',
                  Format: 'SINGLE_STRING',
                  Required: false,
                  ExpectedValues: ['gold'],
                },
                {
                  ClaimName: 'region',
                  Format: 'SINGLE_STRING',
                  Required: true,
                  ExpectedValues: ['eu'],
                },
              ],
            },
          ],
        },
      })
    })

    it('passes CloudFormation intrinsics through verbatim', async () => {
      const issuerUrl = { 'Fn::GetAtt': ['UserPool', 'ProviderURL'] }
      const clientId = { Ref: 'UserPoolClient' }
      const identitySource = { 'Fn::Sub': 'method.request.header.${Header}' }
      const resources = await compile({
        apiGateway: {
          authorizers: {
            orders: ordersAuthorizer({
              issuerUrl,
              audience: [clientId, 'literal'],
              identitySource,
            }),
            single: ordersAuthorizer({ issuerUrl, audience: clientId }),
          },
        },
        functions: withEvent('orders'),
      })

      expect(resources.OrdersApiGatewayJwtAuthorizer.Properties).toMatchObject({
        IdentitySource: identitySource,
        JwtConfiguration: {
          Issuers: [{ Issuer: issuerUrl, Audiences: [clientId, 'literal'] }],
        },
      })
      expect(
        resources.SingleApiGatewayJwtAuthorizer.Properties.JwtConfiguration
          .Issuers,
      ).toEqual([{ Issuer: issuerUrl, Audiences: [clientId] }])
    })

    it('uses <Normalized>ApiGatewayJwtAuthorizer logical IDs and emits every definition', async () => {
      const resources = await compile({
        apiGateway: {
          authorizers: {
            'my-auth': ordersAuthorizer(),
            other_auth: ordersAuthorizer({
              issuerUrl: 'https://o.example.com',
            }),
          },
        },
        functions: withEvent('my-auth'),
      })

      expect(resources.MyDashauthApiGatewayJwtAuthorizer.Properties.Name).toBe(
        'my-auth',
      )
      expect(
        resources.OtherUnderscoreauthApiGatewayJwtAuthorizer.Properties.Name,
      ).toBe('other_auth')
      expect(
        serverless
          .getProvider('aws')
          .naming.getJwtAuthorizerLogicalId('orders'),
      ).toBe('OrdersApiGatewayJwtAuthorizer')
    })

    it('compiles against a shared REST API without any http event', async () => {
      const resources = await compile({
        apiGateway: {
          restApiId: 'abc123',
          restApiRootResourceId: 'root456',
          authorizers: { orders: ordersAuthorizer() },
        },
        functions: { list: {} },
      })

      expect(Object.keys(resources)).toEqual(['OrdersApiGatewayJwtAuthorizer'])
      expect(resources.OrdersApiGatewayJwtAuthorizer.Properties.RestApiId).toBe(
        'abc123',
      )
    })

    // The service proxy plugin is not loaded here: this proves only that the
    // no-REST-API check is skipped when service proxies are configured.
    it('skips the no-REST-API check when service proxies are configured', async () => {
      const resources = await compile({
        apiGateway: { authorizers: { orders: ordersAuthorizer() } },
        functions: { list: {} },
        custom: {
          apiGatewayServiceProxies: [
            { sqs: { path: '/sqs', method: 'post', queueName: 'q' } },
          ],
        },
      })

      expect(
        resources.OrdersApiGatewayJwtAuthorizer.Properties.RestApiId,
      ).toEqual({ Ref: 'ApiGatewayRestApi' })
    })
  })

  describe('http event references', () => {
    const methodOf = (resources) => resources.ApiGatewayMethodOrdersGet

    it('attaches a provider authorizer referenced by string', async () => {
      const resources = await compile({
        apiGateway: { authorizers: { orders: ordersAuthorizer() } },
        functions: withEvent('orders'),
      })

      expect(methodOf(resources).Properties.AuthorizationType).toBe('JWT')
      expect(methodOf(resources).Properties.AuthorizerId).toEqual({
        Ref: 'OrdersApiGatewayJwtAuthorizer',
      })
      expect(methodOf(resources).Properties).not.toHaveProperty(
        'AuthorizationScopes',
      )
      expect(methodOf(resources).DependsOn).toEqual([
        'OrdersApiGatewayJwtAuthorizer',
      ])
    })

    it('attaches a provider authorizer referenced by object, with scopes', async () => {
      const resources = await compile({
        apiGateway: { authorizers: { orders: ordersAuthorizer() } },
        functions: withEvent({
          name: 'orders',
          type: 'JWT',
          scopes: ['orders:read', { Ref: 'Scope' }],
        }),
      })

      expect(methodOf(resources).Properties).toMatchObject({
        AuthorizationType: 'JWT',
        AuthorizerId: { Ref: 'OrdersApiGatewayJwtAuthorizer' },
        AuthorizationScopes: ['orders:read', { Ref: 'Scope' }],
      })
      expect(methodOf(resources).DependsOn).toEqual([
        'OrdersApiGatewayJwtAuthorizer',
      ])
    })

    it('omits AuthorizationScopes for an empty scopes list', async () => {
      const resources = await compile({
        apiGateway: { authorizers: { orders: ordersAuthorizer() } },
        functions: withEvent({ name: 'orders', scopes: [] }),
      })

      expect(methodOf(resources).Properties).not.toHaveProperty(
        'AuthorizationScopes',
      )
    })

    it('attaches an existing authorizer by type: jwt and authorizerId', async () => {
      const authorizerId = { 'Fn::ImportValue': 'shared-orders-authorizer' }
      const resources = await compile({
        apiGateway: {
          restApiId: 'abc123',
          restApiRootResourceId: 'root456',
        },
        functions: withEvent({
          type: 'jwt',
          authorizerId,
          scopes: ['orders:read'],
        }),
      })

      expect(methodOf(resources).Properties).toMatchObject({
        AuthorizationType: 'JWT',
        AuthorizerId: authorizerId,
        AuthorizationScopes: ['orders:read'],
      })
      expect(methodOf(resources).DependsOn).toEqual([
        'ListLambdaPermissionApiGateway',
      ])
      const authorizers = Object.values(resources).filter(
        (resource) => resource.Type === 'AWS::ApiGateway::Authorizer',
      )
      expect(authorizers).toEqual([])
    })

    it('resolves an attached authorizer to its id only, ignoring an unknown name', () => {
      plugin.jwtAuthorizers = new Map()
      expect(
        plugin.resolveJwtAuthorizer(
          {
            authorizer: {
              type: 'jwt',
              authorizerId: 'abc',
              name: 'shared',
              scopes: ['a'],
            },
          },
          'list',
        ),
      ).toEqual({ type: 'JWT', authorizerId: 'abc', scopes: ['a'] })
    })

    it('keeps a non-JWT authorizerId type as written, with its scopes', async () => {
      const resources = await compile({
        apiGateway: {},
        functions: withEvent({
          type: 'cognito_user_pools',
          authorizerId: 'abc',
          scopes: ['email'],
        }),
      })

      expect(methodOf(resources).Properties).toMatchObject({
        AuthorizationType: 'cognito_user_pools',
        AuthorizerId: 'abc',
        AuthorizationScopes: ['email'],
      })
    })

    it('keeps the CORS OPTIONS method open', async () => {
      const resources = await compile({
        apiGateway: { authorizers: { orders: ordersAuthorizer() } },
        functions: withEvent('orders', { cors: true }),
      })

      expect(methodOf(resources).Properties.AuthorizationType).toBe('JWT')
      expect(
        resources.ApiGatewayMethodOrdersOptions.Properties.AuthorizationType,
      ).toBe('NONE')
    })

    it('keeps ApiKeyRequired on a private method', async () => {
      const resources = await compile({
        apiGateway: { authorizers: { orders: ordersAuthorizer() } },
        functions: withEvent('orders', { private: true }),
      })

      expect(methodOf(resources).Properties).toMatchObject({
        AuthorizationType: 'JWT',
        ApiKeyRequired: true,
      })
    })

    it('leaves Lambda and Cognito authorizers of the same service unchanged', async () => {
      const cognitoArn =
        'arn:aws:cognito-idp:us-east-1:123456789012:userpool/us-east-1_abc'
      const resources = await compile({
        apiGateway: { authorizers: { orders: ordersAuthorizer() } },
        functions: {
          auth: {},
          list: {
            events: [
              { http: { path: 'orders', method: 'get', authorizer: 'orders' } },
              { http: { path: 'lambda', method: 'get', authorizer: 'auth' } },
              {
                http: {
                  path: 'cognito',
                  method: 'get',
                  authorizer: { name: 'pool', arn: cognitoArn },
                },
              },
            ],
          },
        },
      })

      expect(resources.AuthApiGatewayAuthorizer.Properties).toMatchObject({
        Name: 'auth',
        Type: 'TOKEN',
        AuthorizerUri: expect.any(Object),
      })
      expect(resources.PoolApiGatewayAuthorizer.Properties).toMatchObject({
        Name: 'pool',
        Type: 'COGNITO_USER_POOLS',
        ProviderARNs: [cognitoArn],
      })
      expect(resources.AuthLambdaPermissionApiGateway).toBeDefined()
      expect(
        resources.ApiGatewayMethodLambdaGet.Properties.AuthorizationType,
      ).toBe('CUSTOM')
      expect(
        resources.ApiGatewayMethodCognitoGet.Properties.AuthorizationType,
      ).toBe('COGNITO_USER_POOLS')
      expect(methodOf(resources).Properties.AuthorizationType).toBe('JWT')
    })
  })

  describe('errors', () => {
    const INVALID = 'API_GATEWAY_JWT_AUTHORIZER_INVALID'

    const definitionError = (definition) =>
      compileError({
        apiGateway: { authorizers: { orders: definition } },
        functions: withEvent('orders'),
      })

    describe('E1 limits, algorithms, claims, duplicates (API_GATEWAY_JWT_AUTHORIZER_INVALID)', () => {
      it('rejects more than 10 issuers', async () => {
        const issuers = Array.from({ length: 11 }, (_, index) => ({
          issuerUrl: `https://idp${index}.example.com`,
          audience: 'a',
        }))
        const error = await definitionError({
          type: 'jwt',
          algorithms: ['RS256'],
          issuers,
        })
        expect(error.code).toBe(INVALID)
        expect(error.message).toBe(
          'API Gateway authorizer "orders" lists 11 issuers. A JWT authorizer trusts 1 to 10 issuers: split them across two authorizers in "provider.apiGateway.authorizers".',
        )
      })

      it('rejects an empty issuers list', async () => {
        const error = await definitionError({
          type: 'jwt',
          algorithms: ['RS256'],
          issuers: [],
        })
        expect(error.code).toBe(INVALID)
        expect(error.message).toContain('lists 0 issuers')
      })

      it('rejects more than 100 audiences', async () => {
        const error = await definitionError(
          ordersAuthorizer({
            audience: Array.from({ length: 101 }, (_, index) => `a${index}`),
          }),
        )
        expect(error.code).toBe(INVALID)
        expect(error.message).toContain(
          'lists 101 audiences in "audience". A JWT issuer accepts 1 to 100 audiences',
        )
      })

      it('rejects an empty audience list', async () => {
        const error = await definitionError(ordersAuthorizer({ audience: [] }))
        expect(error.code).toBe(INVALID)
      })

      it('rejects more than 10 claims', async () => {
        const additionalClaims = Object.fromEntries(
          Array.from({ length: 11 }, (_, index) => [`c${index}`, true]),
        )
        const error = await definitionError(
          ordersAuthorizer({ additionalClaims }),
        )
        expect(error.code).toBe(INVALID)
        expect(error.message).toContain(
          'lists 11 claims in "additionalClaims". A JWT issuer checks at most 10 additional claims',
        )
      })

      it('rejects reserved claim names', async () => {
        const error = await definitionError({
          type: 'jwt',
          algorithms: ['RS256'],
          issuers: [
            {
              issuerUrl: ISSUER,
              audience: 'a',
              additionalClaims: { scope: 'admin' },
            },
          ],
        })
        expect(error.code).toBe(INVALID)
        expect(error.message).toContain(
          'lists claim "scope" in "issuers[0].additionalClaims"',
        )
      })

      it.each([
        ['false', false],
        ['an empty string', ''],
        ['an object without value', { required: false }],
        ['an object with an empty value', { value: '' }],
        ['an object with an unknown key', { value: 'a', format: 'x' }],
        ['a list', ['a']],
      ])('rejects a claim rule set to %s', async (_, rule) => {
        const error = await definitionError(
          ordersAuthorizer({ additionalClaims: { tenant: rule } }),
        )
        expect(error.code).toBe(INVALID)
        expect(error.message).toContain('sets additionalClaims.tenant to')
      })

      it('rejects an unknown algorithm', async () => {
        const error = await definitionError(
          ordersAuthorizer({ algorithms: ['HS256'] }),
        )
        expect(error.code).toBe(INVALID)
        expect(error.message).toBe(
          'API Gateway authorizer "orders" lists algorithm "HS256". A JWT authorizer accepts RS256, RS384, RS512, ES256, ES384, ES512: use the names your issuer\'s discovery document lists under "id_token_signing_alg_values_supported".',
        )
      })

      it('rejects a duplicate algorithm', async () => {
        const error = await definitionError(
          ordersAuthorizer({ algorithms: ['RS256', 'rs256'] }),
        )
        expect(error.code).toBe(INVALID)
      })

      it('rejects a duplicate literal issuer', async () => {
        const error = await definitionError({
          type: 'jwt',
          algorithms: ['RS256'],
          issuers: [
            { issuerUrl: ISSUER, audience: 'a' },
            { issuerUrl: ISSUER, audience: 'b' },
          ],
        })
        expect(error.code).toBe(INVALID)
        expect(error.message).toContain(`lists issuer "${ISSUER}" twice`)
      })

      it('rejects a duplicate intrinsic issuer', async () => {
        const issuerUrl = { 'Fn::GetAtt': ['UserPool', 'ProviderURL'] }
        const error = await definitionError({
          type: 'jwt',
          algorithms: ['RS256'],
          issuers: [
            { issuerUrl, audience: 'a' },
            {
              issuerUrl: { 'Fn::GetAtt': ['UserPool', 'ProviderURL'] },
              audience: 'b',
            },
          ],
        })
        expect(error.code).toBe(INVALID)
        expect(error.message).toContain(
          `lists issuer ${JSON.stringify(issuerUrl)} twice`,
        )
      })

      it('accepts two different intrinsic issuers', async () => {
        const resources = await compile({
          apiGateway: {
            authorizers: {
              orders: {
                type: 'jwt',
                algorithms: ['RS256'],
                issuers: [
                  { issuerUrl: { Ref: 'IssuerA' }, audience: 'a' },
                  { issuerUrl: { Ref: 'IssuerB' }, audience: 'b' },
                ],
              },
            },
          },
          functions: withEvent('orders'),
        })
        expect(
          resources.OrdersApiGatewayJwtAuthorizer.Properties.JwtConfiguration
            .Issuers,
        ).toHaveLength(2)
      })

      it('rejects a duplicate literal audience', async () => {
        const error = await definitionError(
          ordersAuthorizer({ audience: ['api://orders', 'b', 'api://orders'] }),
        )
        expect(error.code).toBe(INVALID)
        expect(error.message).toBe(
          'API Gateway authorizer "orders" lists audience "api://orders" twice. List each audience once.',
        )
      })

      it.each(['orders.v1', 'orders v1', 'orders:v1', 'ördérs'])(
        'rejects the key %s, which CloudFormation cannot use',
        async (key) => {
          const error = await compileError({
            apiGateway: { authorizers: { [key]: ordersAuthorizer() } },
            functions: withEvent({ type: 'jwt', name: key }),
          })
          expect(error.code).toBe(INVALID)
          expect(error.message).toBe(
            `API Gateway authorizer "${key}" has a name CloudFormation can't use. Use letters, digits, "-" and "_" only in the keys of "provider.apiGateway.authorizers"; set "name" to give API Gateway a different name.`,
          )
        },
      )

      it('rejects a key whose CloudFormation resource name is too long', async () => {
        const key = '_'.repeat(24)
        const error = await compileError({
          apiGateway: {
            authorizers: { [key]: ordersAuthorizer({ name: 'short' }) },
          },
          functions: withEvent(key),
        })
        expect(error.code).toBe(INVALID)
        expect(error.message).toContain(
          'which is longer than the 255 characters CloudFormation allows',
        )
        expect(error.message).toContain('Shorten the key')
      })

      it('rejects an unknown key on the authorizer, suggesting the close one', async () => {
        const error = await definitionError(
          ordersAuthorizer({ additionalClaim: { tenant: 'acme' } }),
        )
        expect(error.code).toBe(INVALID)
        expect(error.message).toBe(
          'API Gateway authorizer "orders" sets "additionalClaim", which a JWT authorizer doesn\'t use. Did you mean "additionalClaims"? Use only "type", "name", "identitySource", "algorithms", "issuerUrl", "audience", "additionalClaims", "issuers".',
        )
      })

      it('rejects an unknown key on an entry of issuers', async () => {
        const error = await definitionError({
          type: 'jwt',
          algorithms: ['RS256'],
          issuers: [
            { issuerUrl: ISSUER, audience: 'a' },
            { issuerUrl: 'https://b.example.com', audience: 'b', claims: {} },
          ],
        })
        expect(error.code).toBe(INVALID)
        expect(error.message).toBe(
          'API Gateway authorizer "orders" sets "issuers[1].claims", which a JWT authorizer doesn\'t use. Use only "issuerUrl", "audience", "additionalClaims" in each entry of "issuers".',
        )
      })

      it('accepts an authorizer without claim rules', async () => {
        const resources = await compile({
          apiGateway: { authorizers: { orders: ordersAuthorizer() } },
          functions: withEvent('orders'),
        })
        expect(
          resources.OrdersApiGatewayJwtAuthorizer.Properties.JwtConfiguration
            .Issuers[0].AdditionalClaims,
        ).toBeUndefined()
      })

      it('accepts keys with letters, digits, "-" and "_"', async () => {
        const resources = await compile({
          apiGateway: {
            authorizers: { 'orders-v1_2': ordersAuthorizer() },
          },
          functions: withEvent('orders-v1_2'),
        })
        expect(
          resources.OrdersDashv1Underscore2ApiGatewayJwtAuthorizer,
        ).toBeDefined()
      })

      it.each(['aws_iam', 'AWS_IAM', 'Aws_Iam'])(
        'reserves the key %s',
        async (key) => {
          const error = await compileError({
            apiGateway: { authorizers: { [key]: ordersAuthorizer() } },
            functions: withEvent({ type: 'jwt', name: key }),
          })
          expect(error.code).toBe(INVALID)
          expect(error.message).toBe(
            `API Gateway authorizer "${key}" uses a reserved name: "authorizer: aws_iam" on an http event means IAM authorization. Rename the JWT authorizer.`,
          )
        },
      )

      it('rejects a type other than jwt, in any case', async () => {
        const error = await definitionError(ordersAuthorizer({ type: 'token' }))
        expect(error.code).toBe(INVALID)
        expect(error.message).toContain('sets type to "token"')
      })

      it('rejects a missing type', async () => {
        const error = await definitionError(
          ordersAuthorizer({ type: undefined }),
        )
        expect(error.code).toBe(INVALID)
        expect(error.message).toContain('has no "type"')
      })

      it('rejects a missing issuerUrl', async () => {
        const error = await definitionError(
          ordersAuthorizer({ issuerUrl: undefined }),
        )
        expect(error.code).toBe(INVALID)
        expect(error.message).toContain('has no "issuerUrl"')
      })

      it('rejects a missing audience', async () => {
        const error = await definitionError(
          ordersAuthorizer({ audience: undefined }),
        )
        expect(error.code).toBe(INVALID)
        expect(error.message).toContain('has no "audience"')
      })

      it('rejects issuers next to a top-level issuerUrl', async () => {
        const error = await definitionError(
          ordersAuthorizer({ issuers: [{ issuerUrl: ISSUER, audience: 'a' }] }),
        )
        expect(error.code).toBe(INVALID)
        expect(error.message).toContain('sets both "issuers" and "issuerUrl"')
      })
    })

    describe('E2 issuer URL (API_GATEWAY_JWT_AUTHORIZER_INVALID)', () => {
      it('rejects an http issuer URL', async () => {
        const error = await definitionError(
          ordersAuthorizer({ issuerUrl: 'http://idp.acme.com' }),
        )
        expect(error.code).toBe(INVALID)
        expect(error.message).toBe(
          'API Gateway authorizer "orders" sets issuerUrl to "http://idp.acme.com". Set it to the https URL in your tokens\' "iss" claim, with no query or fragment, for example "https://idp.acme.com".',
        )
      })

      it.each([
        'https://idp.acme.com/?tenant=1',
        'https://idp.acme.com/#x',
        'https://user:pass@idp.acme.com/',
        'idp.acme.com',
        'https://',
        'https:///x',
        ' https://idp.acme.com',
        'https://idp.acme.com ',
        'https://idp.acme.com/\n',
      ])('rejects %j', async (issuerUrl) => {
        const error = await definitionError(ordersAuthorizer({ issuerUrl }))
        expect(error.code).toBe(INVALID)
        expect(error.message).toContain(
          `sets issuerUrl to "${issuerUrl.replace('user:pass@', '***@')}"`,
        )
      })

      it('leaves user info out of the rejected issuer URL it shows', async () => {
        const error = await definitionError(
          ordersAuthorizer({ issuerUrl: 'http://admin:s3cret@idp.acme.com/' }),
        )
        expect(error.code).toBe(INVALID)
        expect(error.message).not.toContain('s3cret')
        expect(error.message).not.toContain('admin')
        expect(error.message).toContain(
          'sets issuerUrl to "http://***@idp.acme.com/"',
        )
        expect(error.message).toContain('for example "https://idp.acme.com/"')
      })

      it('names the key path of an issuer in a list', async () => {
        const error = await definitionError({
          type: 'jwt',
          algorithms: ['RS256'],
          issuers: [
            { issuerUrl: ISSUER, audience: 'a' },
            { issuerUrl: 'http://b.example.com', audience: 'b' },
          ],
        })
        expect(error.code).toBe(INVALID)
        expect(error.message).toContain(
          'sets issuers[1].issuerUrl to "http://b.example.com"',
        )
      })

      it('keeps a trailing slash as written', async () => {
        const resources = await compile({
          apiGateway: {
            authorizers: {
              orders: ordersAuthorizer({ issuerUrl: 'https://a.example.com/' }),
            },
          },
          functions: withEvent('orders'),
        })
        expect(
          resources.OrdersApiGatewayJwtAuthorizer.Properties.JwtConfiguration
            .Issuers[0].Issuer,
        ).toBe('https://a.example.com/')
      })
    })

    describe('E3 identity source (API_GATEWAY_JWT_AUTHORIZER_INVALID)', () => {
      it('rejects a query string identity source', async () => {
        const error = await definitionError(
          ordersAuthorizer({
            identitySource: 'method.request.querystring.token',
          }),
        )
        expect(error.code).toBe(INVALID)
        expect(error.message).toBe(
          'API Gateway authorizer "orders" sets identitySource to "method.request.querystring.token". A JWT authorizer reads one request header: use "method.request.header.<Name>", or leave it out to read the Authorization header.',
        )
      })

      it('rejects two headers', async () => {
        const error = await definitionError(
          ordersAuthorizer({
            identitySource:
              'method.request.header.Authorization, method.request.header.X',
          }),
        )
        expect(error.code).toBe(INVALID)
      })
    })

    describe('E4 unsupported event properties (API_GATEWAY_JWT_AUTHORIZER_UNSUPPORTED_PROPERTY)', () => {
      const UNSUPPORTED = 'API_GATEWAY_JWT_AUTHORIZER_UNSUPPORTED_PROPERTY'

      it('rejects resultTtlInSeconds', async () => {
        const error = await compileError({
          apiGateway: { authorizers: { orders: ordersAuthorizer() } },
          functions: withEvent({ name: 'orders', resultTtlInSeconds: 0 }),
        })
        expect(error.code).toBe(UNSUPPORTED)
        expect(error.message).toBe(
          'Function "list" sets "resultTtlInSeconds" on an http event that uses JWT authorizer "orders". JWT authorizers don\'t cache results: remove "resultTtlInSeconds".',
        )
      })

      it('rejects claims', async () => {
        const error = await compileError({
          apiGateway: { authorizers: { orders: ordersAuthorizer() } },
          functions: withEvent({ name: 'orders', claims: ['email'] }),
        })
        expect(error.code).toBe(UNSUPPORTED)
        expect(error.message).toContain(
          'JWT claims reach your function in requestContext.authorizer.claims: remove "claims".',
        )
      })

      it.each([
        ['identitySource', 'method.request.header.X'],
        ['identityValidationExpression', '.*'],
        ['arn', 'arn:aws:lambda:us-east-1:123456789012:function:auth'],
        ['managedExternally', false],
      ])('rejects %s', async (property, value) => {
        const error = await compileError({
          apiGateway: { authorizers: { orders: ordersAuthorizer() } },
          functions: withEvent({
            type: 'jwt',
            name: 'orders',
            [property]: value,
          }),
        })
        expect(error.code).toBe(UNSUPPORTED)
        expect(error.message).toContain(
          `Function "list" sets "${property}" on an http event that uses JWT authorizer "orders".`,
        )
      })

      it('rejects them next to an authorizerId too', async () => {
        const error = await compileError({
          apiGateway: {},
          functions: withEvent({
            type: 'jwt',
            authorizerId: 'abc',
            identitySource: 'method.request.header.X',
          }),
        })
        expect(error.code).toBe(UNSUPPORTED)
        expect(error.message).toContain('an existing JWT authorizer')
      })

      it.each([
        ['jwt'],
        ['JWT'],
        ['token'],
        ['COGNITO_USER_POOLS'],
        ['aws_iam'],
        [undefined],
      ])(
        'rejects an authorizerId next to the name of a JWT authorizer (type %s)',
        async (type) => {
          const error = await compileError({
            apiGateway: { authorizers: { orders: ordersAuthorizer() } },
            functions: withEvent({ type, name: 'orders', authorizerId: 'abc' }),
          })
          expect(error.code).toBe(UNSUPPORTED)
          expect(error.message).toBe(
            'Function "list" sets both "authorizerId" and JWT authorizer "orders" on an http event. Remove "authorizerId" to use the authorizer defined in "provider.apiGateway.authorizers", or remove "name" to attach the existing authorizer.',
          )
        },
      )
    })

    describe('E5 unknown JWT authorizer (UNRECOGNIZED_API_GATEWAY_AUTHORIZER)', () => {
      it('rejects type: jwt with an undefined name', async () => {
        const error = await compileError({
          apiGateway: { authorizers: { orders: ordersAuthorizer() } },
          functions: withEvent({ type: 'jwt', name: 'orderz' }),
        })
        expect(error.code).toBe('UNRECOGNIZED_API_GATEWAY_AUTHORIZER')
        expect(error.message).toBe(
          'Function "list" references JWT authorizer "orderz", which isn\'t defined. Define it under "provider.apiGateway.authorizers", or set "authorizerId" to attach an existing one.',
        )
      })

      it('rejects type: jwt without name or authorizerId', async () => {
        const error = await compileError({
          apiGateway: {},
          functions: withEvent({ type: 'jwt', scopes: ['a'] }),
        })
        expect(error.code).toBe('UNRECOGNIZED_API_GATEWAY_AUTHORIZER')
      })

      it('rejects type: jwt naming a function', async () => {
        const error = await compileError({
          apiGateway: {},
          functions: { ...withEvent({ type: 'jwt', name: 'auth' }), auth: {} },
        })
        expect(error.code).toBe('UNRECOGNIZED_API_GATEWAY_AUTHORIZER')
      })

      it.each([
        ['a string', 'Orders'],
        ['a { name }', { name: 'ORDERS' }],
        ['a { name } with scopes', { name: 'Orders', scopes: ['a'] }],
        ['a type: jwt', { type: 'jwt', name: 'Orders' }],
      ])(
        'points %s reference in the wrong case at the JWT authorizer',
        async (_label, authorizer) => {
          const error = await compileError({
            apiGateway: { authorizers: { orders: ordersAuthorizer() } },
            functions: withEvent(authorizer),
          })
          const name =
            typeof authorizer === 'string' ? authorizer : authorizer.name
          expect(error.code).toBe('UNRECOGNIZED_API_GATEWAY_AUTHORIZER')
          expect(error.message).toBe(
            `Function "list" references authorizer "${name}", which isn't defined. Did you mean JWT authorizer "orders" from "provider.apiGateway.authorizers"? Names are case-sensitive.`,
          )
        },
      )

      it('keeps a function whose name differs from a JWT key only in case', async () => {
        const resources = await compile({
          apiGateway: { authorizers: { orders: ordersAuthorizer() } },
          functions: { ...withEvent('Orders'), Orders: {} },
        })
        expect(
          resources.ApiGatewayMethodOrdersGet.Properties.AuthorizationType,
        ).toBe('CUSTOM')
      })

      it('leaves a reference with a non-JWT type to the Lambda authorizer rules', async () => {
        const error = await compileError({
          apiGateway: { authorizers: { orders: ordersAuthorizer() } },
          functions: withEvent({ type: 'token', name: 'Orders' }),
        })
        expect(error.message).not.toContain('Did you mean')
      })
    })

    describe('E6 name conflicts (API_GATEWAY_AUTHORIZER_NAME_CONFLICT)', () => {
      const CONFLICT = 'API_GATEWAY_AUTHORIZER_NAME_CONFLICT'

      it('rejects two keys that compile to the same logical ID', async () => {
        const error = await compileError({
          apiGateway: {
            authorizers: {
              orders: ordersAuthorizer(),
              Orders: ordersAuthorizer({ name: 'orders-b' }),
            },
          },
          functions: withEvent('orders'),
        })
        expect(error.code).toBe(CONFLICT)
        expect(error.message).toBe(
          'JWT authorizers "orders" and "Orders" in "provider.apiGateway.authorizers" both compile to the CloudFormation resource "OrdersApiGatewayJwtAuthorizer". Rename one of them so their names differ by more than case or punctuation.',
        )
      })

      it('rejects a string reference that also names a function in the service', async () => {
        const error = await compileError({
          apiGateway: { authorizers: { orders: ordersAuthorizer() } },
          functions: { ...withEvent('orders'), orders: {} },
        })
        expect(error.code).toBe(CONFLICT)
        expect(error.message).toBe(
          '"orders" names both a JWT authorizer in "provider.apiGateway.authorizers" and a function in this service, so the http event of function "list" could mean either. Write "authorizer: { type: jwt, name: orders }" to use the JWT authorizer, or rename it.',
        )
      })

      it('rejects an untyped { name } reference that also names a function in the service', async () => {
        const error = await compileError({
          apiGateway: { authorizers: { orders: ordersAuthorizer() } },
          functions: { ...withEvent({ name: 'orders' }), orders: {} },
        })
        expect(error.code).toBe(CONFLICT)
      })

      it('rejects an untyped { name, arn } reference to a JWT authorizer key', async () => {
        const error = await compileError({
          apiGateway: { authorizers: { orders: ordersAuthorizer() } },
          functions: withEvent({
            name: 'orders',
            arn: 'arn:aws:lambda:us-east-1:123456789012:function:auth',
          }),
        })
        expect(error.code).toBe(CONFLICT)
        expect(error.message).toContain('a Lambda or Cognito authorizer')
      })

      it('still resolves type: jwt with a name that is also a function', async () => {
        const resources = await compile({
          apiGateway: { authorizers: { orders: ordersAuthorizer() } },
          functions: {
            ...withEvent({ type: 'jwt', name: 'orders' }),
            orders: {},
          },
        })
        expect(resources.OrdersApiGatewayJwtAuthorizer).toBeDefined()
      })

      it('rejects a JWT authorizer named like a function used as an authorizer', async () => {
        const error = await compileError({
          apiGateway: { authorizers: { orders: ordersAuthorizer() } },
          functions: {
            ...withEvent({ name: 'orders', type: 'token' }),
            orders: {},
          },
        })
        expect(error.code).toBe(CONFLICT)
        expect(error.message).toBe(
          '"orders" names both a JWT authorizer in "provider.apiGateway.authorizers" and a Lambda or Cognito authorizer. Rename the JWT authorizer: API Gateway needs authorizer names to be unique within a REST API.',
        )
      })

      it.each(['request', 'token'])(
        'accepts a typed (%s) Lambda authorizer named like a JWT key whose API Gateway name differs',
        async (type) => {
          const resources = await compile({
            apiGateway: {
              authorizers: { orders: ordersAuthorizer({ name: 'ordersJwt' }) },
            },
            functions: {
              ...withEvent({ type, name: 'orders' }),
              orders: {},
            },
          })
          expect(
            resources.ApiGatewayMethodOrdersGet.Properties.AuthorizationType,
          ).toBe('CUSTOM')
          expect(resources.OrdersApiGatewayAuthorizer.Properties.Name).toBe(
            'orders',
          )
          expect(resources.OrdersApiGatewayJwtAuthorizer.Properties.Name).toBe(
            'ordersJwt',
          )
        },
      )

      it('accepts a JWT authorizer key that is also an inherited object property', async () => {
        const resources = await compile({
          apiGateway: { authorizers: { constructor: ordersAuthorizer() } },
          functions: withEvent('constructor'),
        })
        expect(
          resources.ApiGatewayMethodOrdersGet.Properties.AuthorizationType,
        ).toBe('JWT')
        expect(
          resources.ConstructorApiGatewayJwtAuthorizer.Properties.Name,
        ).toBe('constructor')
      })

      it('rejects a JWT authorizer named like a Lambda authorizer', async () => {
        const error = await compileError({
          apiGateway: { authorizers: { orders: ordersAuthorizer() } },
          functions: withEvent(
            'arn:aws:lambda:us-east-1:123456789012:function:orders',
          ),
        })
        expect(error.code).toBe(CONFLICT)
      })

      it('accepts a Lambda authorizer named like a JWT key whose API Gateway name differs', async () => {
        const resources = await compile({
          apiGateway: {
            authorizers: { orders: ordersAuthorizer({ name: 'orders-api' }) },
          },
          functions: {
            list: {
              events: [
                {
                  http: {
                    path: 'orders',
                    method: 'get',
                    authorizer: { type: 'jwt', name: 'orders' },
                  },
                },
                {
                  http: {
                    path: 'lambda',
                    method: 'get',
                    authorizer:
                      'arn:aws:lambda:us-east-1:123456789012:function:orders',
                  },
                },
              ],
            },
          },
        })
        expect(resources.OrdersApiGatewayJwtAuthorizer.Properties.Name).toBe(
          'orders-api',
        )
        expect(resources.OrdersApiGatewayAuthorizer.Properties.Name).toBe(
          'orders',
        )
      })

      it('rejects a JWT authorizer whose name matches a Cognito authorizer', async () => {
        const error = await compileError({
          apiGateway: {
            authorizers: { orders: ordersAuthorizer({ name: 'pool' }) },
          },
          functions: withEvent({
            name: 'pool',
            arn: 'arn:aws:cognito-idp:us-east-1:123456789012:userpool/us-east-1_abc',
          }),
        })
        expect(error.code).toBe(CONFLICT)
        expect(error.message).toContain('("orders")')
      })

      it('rejects a Cognito authorizer given the name of a JWT authorizer', async () => {
        const error = await compileError({
          apiGateway: { authorizers: { orders: ordersAuthorizer() } },
          functions: withEvent({
            name: 'orders',
            type: 'COGNITO_USER_POOLS',
            arn: 'arn:aws:cognito-idp:us-east-1:123456789012:userpool/us-east-1_abc',
          }),
        })
        expect(error.code).toBe(CONFLICT)
        expect(error.message).toContain('and a Lambda or Cognito authorizer.')
      })

      it('rejects two JWT authorizers with one name', async () => {
        const error = await compileError({
          apiGateway: {
            authorizers: {
              orders: ordersAuthorizer({ name: 'shared' }),
              billing: ordersAuthorizer({ name: 'shared' }),
            },
          },
          functions: withEvent('orders'),
        })
        expect(error.code).toBe(CONFLICT)
      })
    })

    describe('E7 no REST API (API_GATEWAY_AUTHORIZERS_WITHOUT_REST_API)', () => {
      it('rejects authorizers in a service without a REST API', async () => {
        const error = await compileError({
          apiGateway: { authorizers: { orders: ordersAuthorizer() } },
          functions: { list: {} },
        })
        expect(error.code).toBe('API_GATEWAY_AUTHORIZERS_WITHOUT_REST_API')
        expect(error.message).toBe(
          '"provider.apiGateway.authorizers" defines authorizers, but this service has no REST API: add an http event, or set "provider.apiGateway.restApiId" and "provider.apiGateway.restApiRootResourceId" to the shared REST API.',
        )
      })
    })

    describe('E8 algorithms (API_GATEWAY_JWT_AUTHORIZER_INVALID)', () => {
      it.each([
        ['missing', undefined],
        ['empty', []],
      ])('rejects %s algorithms', async (_, algorithms) => {
        const error = await definitionError(ordersAuthorizer({ algorithms }))
        expect(error.code).toBe(INVALID)
        expect(error.message).toBe(
          'API Gateway authorizer "orders" has no "algorithms". List the signing algorithms your issuer uses, for example "algorithms: [RS256]" (allowed: RS256, RS384, RS512, ES256, ES384, ES512). The issuer\'s discovery document lists them under "id_token_signing_alg_values_supported".',
        )
      })
    })
  })
})
