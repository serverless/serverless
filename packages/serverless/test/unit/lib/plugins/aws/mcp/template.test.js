import { jest } from '@jest/globals'

jest.unstable_mockModule('@serverless/util', () => ({
  log: {
    debug: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
    get: jest.fn(() => ({ debug: jest.fn(), warning: jest.fn() })),
  },
  progress: { get: jest.fn(() => ({ remove: jest.fn() })) },
  style: { aside: jest.fn((s) => s), link: jest.fn((s) => s) },
  writeText: jest.fn(),
  ServerlessError: class ServerlessError extends Error {
    constructor(message, code) {
      super(message)
      this.code = code
    }
  },
  ServerlessErrorCodes: { INVALID_CONFIG: 'INVALID_CONFIG' },
  getOrCreateGlobalDeploymentBucket: jest.fn(),
  addProxyToAwsClient: jest.fn((client) => client),
  stringToSafeColor: jest.fn((str) => str),
  getPluginWriters: jest.fn(() => ({})),
  getPluginConstructors: jest.fn(() => ({})),
  write: jest.fn(),
}))

const { default: AwsMcp } =
  await import('../../../../../../lib/plugins/aws/mcp/index.js')
const { default: AwsCompileApigEvents } =
  await import('../../../../../../lib/plugins/aws/package/compile/events/api-gateway/index.js')
const { default: Serverless } =
  await import('../../../../../../lib/serverless.js')
const { default: AwsProvider } =
  await import('../../../../../../lib/plugins/aws/provider.js')

/**
 * Drive the whole `mcp` -> api-gateway compile pipeline and hand back the
 * compiled CloudFormation template.
 *
 * Both plugins run against one real `Serverless` instance in the hook order the
 * plugin manager would use, so what these tests assert on is the template a
 * deploy would actually upload:
 *
 *  1. `mcp:initialize` validates the block, synthesizes a function per server,
 *     folds in the state grant and sets `SERVERLESS_MCP_STATE_KEY_REF`.
 *  2. `mcp:before:package:compileEvents` hands the route descriptors to the
 *     api-gateway compiler through `registerExternalHttpEvents` and emits the
 *     state resources.
 *  3. api-gateway `package:compileEvents` validates every event - contributed
 *     and function-declared alike - and runs its eleven compile steps.
 *
 * Two ordering constraints are load-bearing (see `schema.test.js`):
 *  - the service configuration must be loaded BEFORE `AwsProvider` is
 *    constructed, because `defineProvider` returns early unless
 *    `service.provider.name === 'aws'`;
 *  - `setFunctionNames` runs before any hook in a real invocation, which is
 *    what lets the synthesized functions rely on carrying an explicit `name`.
 */
const bootService = (mcpConfig, extraFunctions = {}, extraProvider = {}) => {
  const configurationInput = {
    service: 'acme',
    provider: { name: 'aws', region: 'us-east-1', ...extraProvider },
    functions: extraFunctions,
    mcp: mcpConfig,
  }
  const options = { stage: 'dev', region: 'us-east-1' }

  const serverless = new Serverless({
    commands: [],
    options,
    servicePath: process.cwd(),
    serviceConfigFileName: 'serverless.yml',
    service: configurationInput,
  })
  serverless.credentialProviders = { aws: { getCredentials: jest.fn() } }
  serverless.service.loadServiceFileParam()
  serverless.setProvider('aws', new AwsProvider(serverless, options))
  serverless.service.setFunctionNames(options)
  serverless.service.provider.compiledCloudFormationTemplate = {
    Resources: {},
    Outputs: {},
  }

  const mcp = new AwsMcp(serverless, options)
  const apiGateway = new AwsCompileApigEvents(serverless, options)
  // The mcp plugin finds the api-gateway compiler by scanning the loaded plugin
  // instances for the `registerExternalHttpEvents` seam.
  serverless.pluginManager.plugins.push(mcp, apiGateway)

  return { serverless, mcp, apiGateway }
}

/**
 * Drive both plugins and hand back the compiled template.
 *
 * The MCP routes and the discovery MOCK routes are one contribution from the
 * plugin's own hook, so nothing is registered here by hand: a server that
 * declares `oauthDiscovery` gets its discovery methods compiled because the
 * plugin asked for them.
 */
const compileService = async (
  mcpConfig,
  extraFunctions = {},
  { provider = {} } = {},
) => {
  const { serverless, mcp, apiGateway } = bootService(
    mcpConfig,
    extraFunctions,
    provider,
  )

  await mcp.hooks.initialize()
  await mcp.hooks['before:package:compileEvents']()
  await apiGateway.hooks['package:compileEvents']()

  return {
    serverless,
    template: serverless.service.provider.compiledCloudFormationTemplate,
  }
}

const resourcesOfType = (template, type) =>
  Object.entries(template.Resources).filter(
    ([, resource]) => resource.Type === type,
  )

const methodWith = (template, httpMethod) =>
  resourcesOfType(template, 'AWS::ApiGateway::Method').find(
    ([, resource]) => resource.Properties.HttpMethod === httpMethod,
  )?.[1]

const DISCOVERY_GET_ID =
  'ApiGatewayMethodWellDashknownOauthDashprotectedDashresourceCrmMcpGet'
const DISCOVERY_OPTIONS_ID =
  'ApiGatewayMethodWellDashknownOauthDashprotectedDashresourceCrmMcpOptions'

const discoveryDocumentOf = (template) =>
  template.Resources[DISCOVERY_GET_ID].Properties.Integration
    .IntegrationResponses[0].ResponseTemplates['application/json']

describe('mcp compiled template', () => {
  /**
   * The logical-id inventory that the api-gateway compiler and the mcp plugin
   * own between them, for one authed, stateful server - the walkthrough table
   * made executable.
   *
   * This is deliberately NOT the inventory of a real deploy. The harness runs
   * three hooks, so everything contributed by the hooks it does not run is
   * absent by construction:
   *  - `CrmLambdaFunction`, `CrmLogGroup` and the `CrmLambdaVersion*` alias -
   *    `compileFunctions` (`package:compileFunctions`) never runs. The template
   *    still *references* `CrmLambdaFunction` from the integration URI and the
   *    Lambda permission, which is what the second test pins.
   *  - `IamRoleLambdaExecution` - `mergeIamTemplates`
   *    (`package:setupProviderConfiguration`) never runs. The MCP contribution
   *    to IAM is therefore asserted at its pre-merge contribution point,
   *    `provider.iam.role.statements`, in the state test below.
   *  - `ServerlessDeploymentBucket` and `ServerlessDeploymentBucketPolicy` -
   *    the core template is seeded empty here rather than loaded from
   *    `lib/plugins/aws/package/lib/core-cloudformation-template.json`.
   *
   * Environment wiring lives on the function object rather than the template
   * for the same reason, and is asserted there. `Outputs` are asserted
   * separately (see the state test) - this list covers `Resources` only.
   *
   * `ApiGatewayDeployment<instanceId>` is matched on its prefix because
   * `instanceId` comes from `serverless.init()`, which this harness never
   * calls: the id here is literally `ApiGatewayDeploymentundefined`, where a
   * real deploy carries a timestamp suffix. The prefix match is what makes the
   * table hold for both.
   */
  it('emits the api-gateway + mcp-owned resource set for a discovery-publishing, stateful server', async () => {
    const { template } = await compileService(
      {
        servers: {
          crm: {
            server: 'src/server.mjs',
            oauthDiscovery: { issuer: 'https://acme.auth0.com' },
            state: true,
          },
        },
      },
      {},
    )

    const ids = Object.keys(template.Resources)
    expect(
      ids
        .map((id) =>
          id.startsWith('ApiGatewayDeployment') ? 'ApiGatewayDeployment' : id,
        )
        .sort(),
    ).toEqual([
      'ApiGatewayDeployment',
      'ApiGatewayMethodCrmMcpAny',
      DISCOVERY_GET_ID,
      DISCOVERY_OPTIONS_ID,
      'ApiGatewayResourceCrm',
      'ApiGatewayResourceCrmMcp',
      'ApiGatewayResourceWellDashknown',
      'ApiGatewayResourceWellDashknownOauthDashprotectedDashresource',
      'ApiGatewayResourceWellDashknownOauthDashprotectedDashresourceCrm',
      'ApiGatewayResourceWellDashknownOauthDashprotectedDashresourceCrmMcp',
      'ApiGatewayRestApi',
      'CrmLambdaPermissionApiGateway',
      'CrmMcpStateSecret',
    ])

    const anyMethod = methodWith(template, 'ANY')
    expect(anyMethod.Properties.Integration.TimeoutInMillis).toBe(60000)
    expect(anyMethod.Properties.Integration.ResponseTransferMode).toBe('STREAM')
    // `response.transferMode: STREAM` on an AWS_PROXY integration is what
    // switches the integration URI onto Lambda's response-streaming invoke path.
    expect(
      anyMethod.Properties.Integration.Uri['Fn::Join'][1].join(''),
    ).toContain('/response-streaming-invocations')
  })

  it('drives the MCP route from the synthesized function', async () => {
    const { serverless, template } = await compileService({
      servers: { crm: { server: 'src/server.mjs' } },
    })

    expect(serverless.service.functions.crm).toMatchObject({
      name: 'acme-dev-crm',
      handler: 'src/server.default',
      runtime: 'nodejs24.x',
      timeout: 60,
    })
    expect(
      serverless.service.functions.crm.environment.SERVERLESS_MCP_SERVER_MODULE,
    ).toBe('src/server.mjs')
    expect(
      methodWith(template, 'ANY').Properties.Integration.Uri['Fn::Join'][1],
    ).toContainEqual({ 'Fn::GetAtt': ['CrmLambdaFunction', 'Arn'] })
  })

  it('two servers share one RestApi with no duplicate resources', async () => {
    const { template } = await compileService({
      servers: {
        crm: { server: 'src/a.mjs' },
        billing: { server: 'src/b.mjs' },
      },
    })

    expect(resourcesOfType(template, 'AWS::ApiGateway::RestApi')).toHaveLength(
      1,
    )
    expect(
      resourcesOfType(template, 'AWS::ApiGateway::Method')
        .map(([id]) => id)
        .sort(),
    ).toEqual(['ApiGatewayMethodBillingMcpAny', 'ApiGatewayMethodCrmMcpAny'])
    // Each server gets its own `<name>` and `<name>/mcp` path resources; the
    // two trees share nothing but the API root.
    expect(
      resourcesOfType(template, 'AWS::ApiGateway::Resource')
        .map(([id]) => id)
        .sort(),
    ).toEqual([
      'ApiGatewayResourceBilling',
      'ApiGatewayResourceBillingMcp',
      'ApiGatewayResourceCrm',
      'ApiGatewayResourceCrmMcp',
    ])
  })

  // The discovery document only exists to point a client at an issuer, so it is
  // compiled only for a server that names one. The logical ids spell
  // `.well-known` as `WellDashknown` (the path normalizer folds `-` to `Dash`
  // and drops the dot).
  it('no discovery resources without oauthDiscovery', async () => {
    const { template } = await compileService(
      { servers: { crm: { server: 'src/a.mjs' } } },
      {},
    )
    expect(Object.keys(template.Resources).join()).not.toMatch(/WellDashknown/i)
    expect(resourcesOfType(template, 'AWS::ApiGateway::Method')).toHaveLength(1)
  })

  it('shares path resources with an ordinary http function', async () => {
    const { template } = await compileService(
      { servers: { crm: { server: 'src/a.mjs' } } },
      {
        web: {
          handler: 'web.h',
          events: [{ http: { path: 'crm/mcp/extra', method: 'get' } }],
        },
      },
    )

    // Anchor the sharing claim to the MCP route: without this, the counts below
    // would still pass if MCP contributed no routes at all and the whole
    // `crm/mcp/extra` tree came from the user's own http event.
    expect(template.Resources.ApiGatewayMethodCrmMcpAny).toBeDefined()
    expect(resourcesOfType(template, 'AWS::ApiGateway::Method')).toHaveLength(2)

    const pathParts = resourcesOfType(
      template,
      'AWS::ApiGateway::Resource',
    ).map(([, resource]) => resource.Properties.PathPart)
    expect(pathParts.filter((part) => part === 'crm')).toHaveLength(1)
    expect(pathParts.filter((part) => part === 'mcp')).toHaveLength(1)
    expect(pathParts).toContain('extra')
    // The user route hangs off the very resource the MCP route is mounted on.
    expect(
      template.Resources.ApiGatewayResourceCrmMcpExtra.Properties.ParentId,
    ).toEqual({ Ref: 'ApiGatewayResourceCrmMcp' })
  })

  it('provisions the state key and wires it to the function', async () => {
    const { serverless, template } = await compileService({
      servers: { crm: { server: 'src/server.mjs', state: true } },
    })

    expect(template.Resources.CrmMcpStateSecret).toMatchObject({
      Type: 'AWS::SecretsManager::Secret',
    })
    expect(template.Outputs.CrmMcpStateSecretArn).toEqual({
      Value: { Ref: 'CrmMcpStateSecret' },
    })
    expect(
      serverless.service.functions.crm.environment.SERVERLESS_MCP_STATE_KEY_REF,
    ).toEqual({ Ref: 'CrmMcpStateSecret' })
    expect(serverless.service.provider.iam.role.statements).toEqual([
      {
        Effect: 'Allow',
        Action: ['secretsmanager:GetSecretValue'],
        Resource: [{ Ref: 'CrmMcpStateSecret' }],
      },
    ])
  })

  // Both of these must be in place at the end of `mcp:initialize`, not merely
  // by the end of the pipeline: `mergeIamTemplates` consumes
  // `provider.iam.role.statements` on `package:setupProviderConfiguration`, and
  // `compileFunctions` snapshots `functions.<name>.environment` on
  // `package:compileFunctions` - both of which run before
  // `before:package:compileEvents`. A contribution deferred to the later hook
  // would still produce the template these tests assert on, but would silently
  // drop the grant and the env var from a real deploy.
  it('contributes the state grant and env ref during initialize, before any package hook', async () => {
    const { serverless, mcp } = bootService({
      servers: { crm: { server: 'src/server.mjs', state: true } },
    })

    await mcp.hooks.initialize()

    expect(
      serverless.service.functions.crm.environment.SERVERLESS_MCP_STATE_KEY_REF,
    ).toEqual({ Ref: 'CrmMcpStateSecret' })
    expect(serverless.service.provider.iam.role.statements).toEqual([
      {
        Effect: 'Allow',
        Action: ['secretsmanager:GetSecretValue'],
        Resource: [{ Ref: 'CrmMcpStateSecret' }],
      },
    ])
    // The secret itself is emitted later, by `before:package:compileEvents` -
    // the `Ref` above is a forward reference at this point.
    expect(
      serverless.service.provider.compiledCloudFormationTemplate.Resources,
    ).toEqual({})
  })

  it('guards the MCP route with a user authorizer, never the discovery route', async () => {
    const { template } = await compileService(
      {
        servers: {
          crm: {
            server: 'src/server.mjs',
            authorizer: 'myAuth',
            oauthDiscovery: { issuer: 'https://acme.auth0.com' },
          },
        },
      },
      { myAuth: { handler: 'auth.handler' } },
    )

    expect(template.Resources.MyAuthApiGatewayAuthorizer).toMatchObject({
      Type: 'AWS::ApiGateway::Authorizer',
      Properties: { Type: 'TOKEN' },
    })

    const anyMethod = methodWith(template, 'ANY')
    expect(anyMethod.Properties.AuthorizationType).toBe('CUSTOM')
    expect(anyMethod.Properties.AuthorizerId).toEqual({
      Ref: 'MyAuthApiGatewayAuthorizer',
    })

    // The OAuth protected-resource metadata document has to stay reachable
    // without a token, or a client can never discover where to get one - and so
    // does the preflight that a browser client sends before reading it.
    for (const id of [DISCOVERY_GET_ID, DISCOVERY_OPTIONS_ID]) {
      expect(template.Resources[id].Properties.AuthorizationType).toBe('NONE')
      expect(template.Resources[id].Properties).not.toHaveProperty(
        'AuthorizerId',
      )
    }
  })

  // The headline object shape: a Cognito user pool named by its ARN, with a
  // name of the user's own for the logical id and scopes on the method. Pinned
  // here rather than only in the live suite, whose enforcement coverage is
  // gated on a Cognito prerequisite and skips silently without it.
  it('compiles a Cognito pool authorizer object into a COGNITO_USER_POOLS method', async () => {
    const poolArn =
      'arn:aws:cognito-idp:us-east-1:123456789012:userpool/us-east-1_aBcDe12Fg'
    const { template } = await compileService({
      servers: {
        crm: {
          server: 'src/server.mjs',
          authorizer: {
            type: 'cognito_user_pools',
            arn: poolArn,
            name: 'crmPool',
            scopes: ['mcp/invoke'],
          },
        },
      },
    })

    expect(template.Resources.CrmPoolApiGatewayAuthorizer).toMatchObject({
      Type: 'AWS::ApiGateway::Authorizer',
      Properties: {
        Type: 'COGNITO_USER_POOLS',
        Name: 'crmPool',
        ProviderARNs: [poolArn],
      },
    })
    expect(
      template.Resources.CrmPoolApiGatewayAuthorizer.Properties,
    ).not.toHaveProperty('AuthorizerUri')

    const anyMethod = methodWith(template, 'ANY')
    expect(anyMethod.Properties.AuthorizationType).toBe('COGNITO_USER_POOLS')
    expect(anyMethod.Properties.AuthorizationScopes).toEqual(['mcp/invoke'])
    expect(anyMethod.Properties.AuthorizerId).toEqual({
      Ref: 'CrmPoolApiGatewayAuthorizer',
    })
  })

  it('compiles a REQUEST authorizer object into a REQUEST authorizer resource', async () => {
    const { template } = await compileService(
      {
        servers: {
          crm: {
            server: 'src/server.mjs',
            authorizer: {
              name: 'myAuth',
              type: 'request',
              identitySource:
                'method.request.header.Authorization,method.request.header.X-Tenant',
              resultTtlInSeconds: 0,
            },
          },
        },
      },
      { myAuth: { handler: 'auth.handler' } },
    )

    expect(template.Resources.MyAuthApiGatewayAuthorizer).toMatchObject({
      Type: 'AWS::ApiGateway::Authorizer',
      Properties: {
        Type: 'REQUEST',
        AuthorizerResultTtlInSeconds: 0,
        IdentitySource:
          'method.request.header.Authorization,method.request.header.X-Tenant',
      },
    })
    // Every Lambda authorizer, TOKEN or REQUEST, is CUSTOM at the method.
    expect(methodWith(template, 'ANY').Properties.AuthorizationType).toBe(
      'CUSTOM',
    )
  })

  // The type is accepted in any case, and the seam forwards it into the
  // template without folding it - so every accepted spelling has to land on a
  // value API Gateway actually has. `CUSTOM` is a method AuthorizationType with
  // no authorizer-resource counterpart, which is the trap in both directions.
  it.each([
    ['token', 'TOKEN'],
    ['TOKEN', 'TOKEN'],
    ['Token', 'TOKEN'],
    ['custom', 'TOKEN'],
    ['CUSTOM', 'TOKEN'],
    ['request', 'REQUEST'],
    ['Request', 'REQUEST'],
  ])(
    'compiles a generated authorizer of type %s into resource Type %s',
    async (type, expectedType) => {
      const { template } = await compileService(
        {
          servers: {
            crm: {
              server: 'src/server.mjs',
              authorizer: { name: 'myAuth', type },
            },
          },
        },
        { myAuth: { handler: 'auth.handler' } },
      )

      expect(
        template.Resources.MyAuthApiGatewayAuthorizer.Properties.Type,
      ).toBe(expectedType)
      expect(methodWith(template, 'ANY').Properties.AuthorizationType).toBe(
        'CUSTOM',
      )
    },
  )

  it.each([
    ['token', 'CUSTOM'],
    ['TOKEN', 'CUSTOM'],
    ['request', 'CUSTOM'],
    ['custom', 'CUSTOM'],
    ['cognito_user_pools', 'COGNITO_USER_POOLS'],
    ['Cognito_User_Pools', 'COGNITO_USER_POOLS'],
  ])(
    'attaches an existing authorizer of type %s as AuthorizationType %s',
    async (type, expectedAuthorizationType) => {
      const { template } = await compileService({
        servers: {
          crm: {
            server: 'src/server.mjs',
            authorizer: { authorizerId: 'abc123', type },
          },
        },
      })

      const anyMethod = methodWith(template, 'ANY')
      expect(anyMethod.Properties.AuthorizationType).toBe(
        expectedAuthorizationType,
      )
      expect(anyMethod.Properties.AuthorizerId).toBe('abc123')
      // Nothing is created for an authorizer that already exists.
      expect(
        resourcesOfType(template, 'AWS::ApiGateway::Authorizer'),
      ).toHaveLength(0)
    },
  )

  // A generated Cognito authorizer in any casing the type is accepted in - the
  // resource `Type` and the method `AuthorizationType` are the same word here,
  // and neither may carry the user's casing into the template.
  it.each(['cognito_user_pools', 'Cognito_User_Pools', 'COGNITO_USER_POOLS'])(
    'compiles a generated authorizer of type %s into COGNITO_USER_POOLS',
    async (type) => {
      const { template } = await compileService({
        servers: {
          crm: {
            server: 'src/server.mjs',
            authorizer: {
              name: 'crmPool',
              type,
              arn: 'arn:aws:cognito-idp:us-east-1:123456789012:userpool/us-east-1_aBcDe12Fg',
            },
          },
        },
      })

      expect(
        template.Resources.CrmPoolApiGatewayAuthorizer.Properties.Type,
      ).toBe('COGNITO_USER_POOLS')
      expect(methodWith(template, 'ANY').Properties.AuthorizationType).toBe(
        'COGNITO_USER_POOLS',
      )
    },
  )

  it.each([
    ['the bare string', 'aws_iam'],
    ['the string in any case', 'AWS_IAM'],
    ['an object with no identifier', { type: 'aws_iam' }],
    [
      'an object naming a function that is then inert',
      {
        type: 'Aws_Iam',
        name: 'myAuth',
      },
    ],
  ])(
    'passes an aws_iam authorizer written as %s through as AWS_IAM with no authorizer resource',
    async (_label, authorizer) => {
      const { template } = await compileService(
        { servers: { crm: { server: 'src/server.mjs', authorizer } } },
        { myAuth: { handler: 'auth.handler' } },
      )

      expect(methodWith(template, 'ANY').Properties.AuthorizationType).toBe(
        'AWS_IAM',
      )
      expect(methodWith(template, 'ANY').Properties).not.toHaveProperty(
        'AuthorizerId',
      )
      expect(
        resourcesOfType(template, 'AWS::ApiGateway::Authorizer'),
      ).toHaveLength(0)
    },
  )

  it('compiles the discovery GET into a MOCK integration serving the document', async () => {
    const { template } = await compileService(
      {
        servers: {
          crm: {
            server: 'src/server.mjs',
            oauthDiscovery: {
              issuer: 'https://acme.auth0.com',
              publicUrl: 'https://mcp.acme.com',
            },
          },
        },
      },
      {},
    )

    const { Integration, MethodResponses } =
      template.Resources[DISCOVERY_GET_ID].Properties
    expect(Integration.Type).toBe('MOCK')
    expect(Integration.RequestTemplates).toEqual({
      'application/json': '{"statusCode": 200}',
    })
    expect(Integration.IntegrationResponses[0]).toMatchObject({
      StatusCode: '200',
      ResponseParameters: {
        'method.response.header.Content-Type': "'application/json'",
        'method.response.header.Access-Control-Allow-Origin': "'*'",
      },
    })
    expect(discoveryDocumentOf(template)).toBe(
      '{"resource":"https://mcp.acme.com/crm/mcp","authorization_servers":["https://acme.auth0.com"],"bearer_methods_supported":["header"]}',
    )
    // A header only reaches the client if the method response declares it.
    expect(MethodResponses).toEqual([
      {
        StatusCode: '200',
        ResponseModels: {},
        ResponseParameters: {
          'method.response.header.Content-Type': true,
          'method.response.header.Access-Control-Allow-Origin': true,
        },
      },
    ])
  })

  it('compiles the discovery OPTIONS into a 204 preflight', async () => {
    const { template } = await compileService(
      {
        servers: {
          crm: {
            server: 'src/server.mjs',
            oauthDiscovery: { issuer: 'https://acme.auth0.com' },
          },
        },
      },
      {},
    )

    const { Integration, MethodResponses } =
      template.Resources[DISCOVERY_OPTIONS_ID].Properties
    expect(Integration.Type).toBe('MOCK')
    expect(Integration.RequestTemplates).toEqual({
      'application/json': '{"statusCode": 204}',
    })
    expect(Integration.IntegrationResponses[0]).toMatchObject({
      StatusCode: '204',
      ResponseParameters: {
        'method.response.header.Access-Control-Allow-Origin': "'*'",
        'method.response.header.Access-Control-Allow-Methods': "'GET,OPTIONS'",
        'method.response.header.Access-Control-Allow-Headers':
          "'content-type,mcp-protocol-version,authorization'",
      },
    })
    expect(Integration.IntegrationResponses[0].ResponseTemplates).toEqual({})
    expect(MethodResponses[0].StatusCode).toBe('204')
  })

  // An API Gateway stage serves the methods its Deployment depended on when it
  // was published. A contributed method missing from that list can be created
  // by CloudFormation and still 403 on the public URL, because the deployment
  // that fronts it was cut before the method existed.
  it('includes the discovery methods in the deployment dependencies', async () => {
    const { template } = await compileService(
      {
        servers: {
          crm: {
            server: 'src/server.mjs',
            oauthDiscovery: { issuer: 'https://acme.auth0.com' },
          },
        },
      },
      {},
    )

    const [, deployment] = resourcesOfType(
      template,
      'AWS::ApiGateway::Deployment',
    )[0]
    expect(deployment.DependsOn).toEqual(
      expect.arrayContaining([
        'ApiGatewayMethodCrmMcpAny',
        DISCOVERY_GET_ID,
        DISCOVERY_OPTIONS_ID,
      ]),
    )
  })

  it('derives the document URL from a REST custom domain', async () => {
    const { template } = await compileService(
      {
        servers: {
          crm: {
            server: 'src/server.mjs',
            oauthDiscovery: { issuer: 'https://acme.auth0.com' },
          },
        },
      },
      {},
      {
        provider: { domain: { name: 'api.acme.com', basePath: 'v1' } },
      },
    )

    expect(discoveryDocumentOf(template)).toBe(
      '{"resource":"https://api.acme.com/v1/crm/mcp","authorization_servers":["https://acme.auth0.com"],"bearer_methods_supported":["header"]}',
    )
  })

  // With nothing in front of the API the stage URL is the only address, and the
  // REST API id only exists once CloudFormation has created it - so the
  // document ships as an intrinsic that the deploy renders. `Fn::Sub` survives
  // the Framework's own `${...}` variable resolver untouched.
  it('emits the stage URL as an Fn::Sub when no domain fronts the API', async () => {
    const { template } = await compileService(
      {
        servers: {
          crm: {
            server: 'src/server.mjs',
            oauthDiscovery: { issuer: 'https://acme.auth0.com' },
          },
        },
      },
      {},
    )

    expect(discoveryDocumentOf(template)).toEqual({
      'Fn::Sub': [
        '{"resource":"https://${RestApiId}.execute-api.${AWS::Region}.${AWS::URLSuffix}/dev/crm/mcp","authorization_servers":["https://acme.auth0.com"],"bearer_methods_supported":["header"]}',
        { RestApiId: { Ref: 'ApiGatewayRestApi' } },
      ],
    })
  })

  // An imported API means no `ApiGatewayRestApi` resource is ever created
  // (`api-gateway/lib/rest-api.js` returns before creating it), so a document
  // referencing that logical id would fail the deploy with an unresolved
  // reference. The variable map carries the imported id instead.
  it('substitutes an imported REST API id into the stage URL', async () => {
    const { template } = await compileService(
      {
        servers: {
          crm: {
            server: 'src/server.mjs',
            oauthDiscovery: { issuer: 'https://acme.auth0.com' },
          },
        },
      },
      {},
      {
        provider: {
          apiGateway: {
            restApiId: 'imported123',
            restApiRootResourceId: 'rootres1',
          },
        },
      },
    )

    const [subTemplate, variables] = discoveryDocumentOf(template)['Fn::Sub']
    expect(variables).toEqual({ RestApiId: 'imported123' })
    expect(subTemplate).not.toContain('ApiGatewayRestApi')
    // Nothing else in the template names it either - the resource genuinely
    // does not exist on an imported API.
    expect(template.Resources.ApiGatewayRestApi).toBeUndefined()
  })

  // An issuer that names a pool this same stack creates is only expressible as
  // an intrinsic. It reaches the compiled document through the `Fn::Sub` the
  // document is already rendered with - one deploy, no self-referencing
  // `${cf:}` read.
  it('compiles an Fn::Sub issuer naming a same-stack pool into the document', async () => {
    const { template } = await compileService(
      {
        servers: {
          crm: {
            server: 'src/server.mjs',
            oauthDiscovery: {
              issuer: {
                'Fn::Sub':
                  'https://cognito-idp.${AWS::Region}.amazonaws.com/${UserPool}',
              },
            },
          },
        },
      },
      {},
    )

    expect(discoveryDocumentOf(template)).toEqual({
      'Fn::Sub': [
        '{"resource":"https://${RestApiId}.execute-api.${AWS::Region}.${AWS::URLSuffix}/dev/crm/mcp","authorization_servers":["https://cognito-idp.${AWS::Region}.amazonaws.com/${UserPool}"],"bearer_methods_supported":["header"]}',
        { RestApiId: { Ref: 'ApiGatewayRestApi' } },
      ],
    })
  })

  it('compiles an Fn::GetAtt issuer into the document variable map', async () => {
    const { template } = await compileService(
      {
        servers: {
          crm: {
            server: 'src/server.mjs',
            oauthDiscovery: {
              issuer: { 'Fn::GetAtt': ['UserPool', 'ProviderURL'] },
              publicUrl: 'https://mcp.acme.com',
            },
          },
        },
      },
      {},
    )

    expect(discoveryDocumentOf(template)).toEqual({
      'Fn::Sub': [
        '{"resource":"https://mcp.acme.com/crm/mcp","authorization_servers":["${McpOauthIssuer}"],"bearer_methods_supported":["header"]}',
        { McpOauthIssuer: { 'Fn::GetAtt': ['UserPool', 'ProviderURL'] } },
      ],
    })
  })

  // Two discovery-enabled servers share the whole `.well-known/...` prefix, so
  // the shared parent resources have to be emitted once and the leaf trees have
  // to stay separate - and each server's document has to describe itself.
  it('compiles two discovery-enabled servers onto shared .well-known parents', async () => {
    const { template } = await compileService(
      {
        servers: {
          crm: {
            server: 'src/a.mjs',
            oauthDiscovery: {
              issuer: 'https://acme.auth0.com',
              publicUrl: 'https://mcp.acme.com',
            },
          },
          billing: {
            server: 'src/b.mjs',
            oauthDiscovery: {
              issuer: 'https://billing.auth0.com',
              publicUrl: 'https://pay.acme.com',
            },
          },
        },
      },
      {},
    )

    const pathParts = resourcesOfType(
      template,
      'AWS::ApiGateway::Resource',
    ).map(([, resource]) => resource.Properties.PathPart)
    expect(pathParts.filter((part) => part === '.well-known')).toHaveLength(1)
    expect(
      pathParts.filter((part) => part === 'oauth-protected-resource'),
    ).toHaveLength(1)

    const billingGet =
      'ApiGatewayMethodWellDashknownOauthDashprotectedDashresourceBillingMcpGet'
    const billingOptions =
      'ApiGatewayMethodWellDashknownOauthDashprotectedDashresourceBillingMcpOptions'
    expect(
      resourcesOfType(template, 'AWS::ApiGateway::Method')
        .map(([id]) => id)
        .sort(),
    ).toEqual(
      [
        'ApiGatewayMethodBillingMcpAny',
        'ApiGatewayMethodCrmMcpAny',
        DISCOVERY_GET_ID,
        DISCOVERY_OPTIONS_ID,
        billingGet,
        billingOptions,
      ].sort(),
    )

    // Each document describes its own server, not the other's.
    expect(discoveryDocumentOf(template)).toBe(
      '{"resource":"https://mcp.acme.com/crm/mcp","authorization_servers":["https://acme.auth0.com"],"bearer_methods_supported":["header"]}',
    )
    expect(
      template.Resources[billingGet].Properties.Integration
        .IntegrationResponses[0].ResponseTemplates['application/json'],
    ).toBe(
      '{"resource":"https://pay.acme.com/billing/mcp","authorization_servers":["https://billing.auth0.com"],"bearer_methods_supported":["header"]}',
    )

    const [, deployment] = resourcesOfType(
      template,
      'AWS::ApiGateway::Deployment',
    )[0]
    expect(deployment.DependsOn).toEqual(
      expect.arrayContaining([
        DISCOVERY_GET_ID,
        DISCOVERY_OPTIONS_ID,
        billingGet,
        billingOptions,
      ]),
    )
  })
})
