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
const bootService = (mcpConfig, extraFunctions = {}) => {
  const configurationInput = {
    service: 'acme',
    provider: { name: 'aws', region: 'us-east-1' },
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

const compileService = async (mcpConfig, extraFunctions = {}) => {
  const { serverless, mcp, apiGateway } = bootService(mcpConfig, extraFunctions)

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
  it('emits the api-gateway + mcp-owned resource set for an authed, stateful server', async () => {
    const { template } = await compileService({
      servers: {
        crm: {
          server: 'src/server.mjs',
          auth: {
            issuer: 'https://acme.auth0.com',
            audiences: ['https://mcp.acme.com'],
          },
          state: true,
        },
      },
    })

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
      'ApiGatewayMethodWellDashknownOauthDashprotectedDashresourceCrmMcpGet',
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

  // The discovery document only exists to point a client at the issuer, so it
  // is compiled only for a server that actually enforces tokens. The logical ids
  // spell `.well-known` as `WellDashknown` (the path normalizer folds `-` to
  // `Dash` and drops the dot).
  it('no discovery resources without auth', async () => {
    const { template } = await compileService({
      servers: { crm: { server: 'src/a.mjs' } },
    })
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
            auth: {
              issuer: 'https://acme.auth0.com',
              audiences: ['https://mcp.acme.com'],
              authorizer: 'myAuth',
            },
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
    // without a token, or a client can never discover where to get one.
    const discoveryMethod = methodWith(template, 'GET')
    expect(discoveryMethod.Properties.AuthorizationType).toBe('NONE')
    expect(discoveryMethod.Properties).not.toHaveProperty('AuthorizerId')
  })
})
