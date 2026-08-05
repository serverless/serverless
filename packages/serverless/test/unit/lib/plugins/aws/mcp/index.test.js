import { jest } from '@jest/globals'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

jest.unstable_mockModule('@serverless/util', () => ({
  log: {
    debug: jest.fn(),
    warning: jest.fn(),
    info: jest.fn(),
    get: jest.fn(() => ({
      debug: jest.fn(),
      warning: jest.fn(),
      info: jest.fn(),
    })),
  },
  progress: { get: jest.fn(() => ({ remove: jest.fn() })) },
  style: { aside: jest.fn((s) => s) },
  writeText: jest.fn(),
  ServerlessError: class ServerlessError extends Error {
    constructor(message, code) {
      super(message)
      this.code = code
    }
  },
  ServerlessErrorCodes: {},
  // Additional exports pulled in by `lib/serverless.js` and the AWS provider,
  // which the config-read-path tests instantiate for real.
  getOrCreateGlobalDeploymentBucket: jest.fn(),
  addProxyToAwsClient: jest.fn((client) => client),
  stringToSafeColor: jest.fn((str) => str),
  getPluginWriters: jest.fn(() => ({})),
  getPluginConstructors: jest.fn(() => ({})),
  write: jest.fn(),
}))

const { default: AwsMcp } =
  await import('../../../../../../lib/plugins/aws/mcp/index.js')
const { default: Serverless } =
  await import('../../../../../../lib/serverless.js')
const { default: AwsProvider } =
  await import('../../../../../../lib/plugins/aws/provider.js')
// The real naming object, so the logical IDs asserted here are the ones the
// provider produces (`-` -> `Dash`) rather than a mock's approximation.
const { default: naming } =
  await import('../../../../../../lib/plugins/aws/lib/naming.js')
// The real esbuild plugin, so the emitted-path rewrite under test is derived
// from the same `_outputExtension` the bundler actually names its output with.
const { default: Esbuild } =
  await import('../../../../../../lib/plugins/esbuild/index.js')
const { log, writeText } = await import('@serverless/util')

const serviceEndpoint = 'https://abc123.execute-api.us-east-1.amazonaws.com/dev'

// Every `makeServerless` shares one directory: only the packaging tests write
// into it, and they clean up after themselves.
let serviceDir

beforeAll(async () => {
  serviceDir = await mkdtemp(path.join(tmpdir(), 'mcp-plugin-'))
})

afterAll(async () => {
  if (serviceDir) await rm(serviceDir, { recursive: true, force: true })
})

const makeServerless = () => ({
  service: {
    service: 'acme',
    provider: {
      name: 'aws',
      compiledCloudFormationTemplate: { Resources: {}, Outputs: {} },
    },
    functions: {},
    package: {},
  },
  // Both spellings: the esbuild plugin reads each in different places.
  config: { serviceDir },
  serviceDir,
  configSchemaHandler: { defineTopLevelProperty: jest.fn() },
  // The seam every plugin uses to contribute a section to the deploy/info
  // summary, so the lines land in the right place (and out of `info --json`).
  addServiceOutputSection: jest.fn(),
  // Mirrors how the plugin discovers the api-gateway compiler: by scanning the
  // loaded plugin instances for the `registerExternalHttpEvents` seam, and how
  // it reads the stack outputs the info plugin gathered before the `after:`
  // hooks run.
  pluginManager: {
    plugins: [
      { registerExternalHttpEvents: jest.fn() },
      {
        gatheredData: {
          info: { endpoints: [serviceEndpoint] },
          outputs: [
            { OutputKey: 'ServiceEndpoint', OutputValue: serviceEndpoint },
          ],
        },
      },
    ],
  },
  getProvider: jest.fn(() => ({
    getStage: () => 'dev',
    getRegion: () => 'us-east-1',
    // `getStackName` is the one naming method that reads back through the
    // provider, which this mock is not - the rest are pure.
    naming: { ...naming, getStackName: () => 'acme-dev' },
    // Borrowed from the real provider rather than restated, so the BYO-role
    // detection under test cannot drift from the check the IAM merge uses.
    isExistingRoleProvided: AwsProvider.prototype.isExistingRoleProvided,
    // The AWS seam the deploy-time state permission check goes through.
    request: jest.fn(),
  })),
})

const apiGatewayPluginOf = (serverless) => serverless.pluginManager.plugins[0]

describe('AwsMcp plugin', () => {
  it('registers the mcp top-level schema on construction', () => {
    const serverless = makeServerless()
    new AwsMcp(serverless, { stage: 'dev' })
    expect(
      serverless.configSchemaHandler.defineTopLevelProperty,
    ).toHaveBeenCalledWith('mcp', expect.objectContaining({ type: 'object' }))
  })

  it('defines initialize and before:package:compileEvents hooks', () => {
    const plugin = new AwsMcp(makeServerless(), {})
    expect(plugin.hooks.initialize).toBeInstanceOf(Function)
    expect(plugin.hooks['before:package:compileEvents']).toBeInstanceOf(
      Function,
    )
    expect(plugin.hooks['after:deploy:deploy']).toBeInstanceOf(Function)
    expect(plugin.hooks['after:info:info']).toBeInstanceOf(Function)
  })

  it('leaves the service model untouched without an mcp block', async () => {
    const serverless = makeServerless()
    serverless.service.functions = { existing: { handler: 'src/api.handler' } }
    const functionsBefore = serverless.service.functions
    const plugin = new AwsMcp(serverless, {})
    await plugin.hooks.initialize()
    await plugin.hooks['before:package:compileEvents']()
    expect(serverless.service.functions).toBe(functionsBefore)
    expect(serverless.service.functions).toEqual({
      existing: { handler: 'src/api.handler' },
    })
    // `validated` is only assigned from a `validateMcp` return value, so its
    // absence proves validation never ran.
    expect(plugin.validated).toBeUndefined()
    expect(
      apiGatewayPluginOf(serverless).registerExternalHttpEvents,
    ).not.toHaveBeenCalled()
  })

  // Under the default configValidationMode ("warn") a schema violation does
  // not stop the run, so a top-level `mcp` key of any shape reaches
  // `initialize`. A block that does not carry a `servers` object is not this
  // plugin's to interpret — before this plugin existed such a key drew only
  // the unrecognized-property warning and the service deployed on, and that
  // must stay true.
  it.each([
    ['a boolean', true],
    ['a string', 'not ours'],
    ['an array', [{ servers: {} }]],
    ['an empty object', {}],
    ['a foreign object', { transport: 'stdio', port: 3000 }],
    ['servers as an array', { servers: [{ server: 'src/server.mjs' }] }],
    ['servers as a string', { servers: 'src/server.mjs' }],
  ])('stands down when the mcp block is %s', async (_label, mcp) => {
    const serverless = makeServerless()
    serverless.service.functions = { existing: { handler: 'src/api.handler' } }
    serverless.configurationInput = { mcp }
    const plugin = new AwsMcp(serverless, {})
    await plugin.hooks.initialize()
    await plugin.hooks['before:package:compileEvents']()
    expect(plugin.validated).toBeUndefined()
    expect(serverless.service.functions).toEqual({
      existing: { handler: 'src/api.handler' },
    })
    expect(
      apiGatewayPluginOf(serverless).registerExternalHttpEvents,
    ).not.toHaveBeenCalled()
  })

  // `getProvider('aws')` resolves to undefined under a non-aws provider, and
  // this plugin is not provider-scoped, so its `initialize` hook still runs -
  // reaching for `provider.getStage()` would fail with a bare TypeError.
  describe('non-aws provider', () => {
    const makeNonAwsServerless = () => {
      const serverless = makeServerless()
      serverless.service.provider = { name: 'google' }
      serverless.getProvider = jest.fn(() => undefined)
      return serverless
    }

    it('fails with a teaching error when an mcp block is present', async () => {
      const serverless = makeNonAwsServerless()
      serverless.service.mcp = {
        servers: { crm: { server: 'src/server.mjs' } },
      }
      const plugin = new AwsMcp(serverless, {})
      await expect(plugin.hooks.initialize()).rejects.toMatchObject({
        code: 'MCP_AWS_PROVIDER_REQUIRED',
        message: expect.stringContaining('provider.name'),
      })
    })

    it('does not fail with a bare TypeError', async () => {
      const serverless = makeNonAwsServerless()
      serverless.service.mcp = {
        servers: { crm: { server: 'src/server.mjs' } },
      }
      const plugin = new AwsMcp(serverless, {})
      await expect(plugin.hooks.initialize()).rejects.not.toBeInstanceOf(
        TypeError,
      )
    })

    // The guard sits behind the config check, so a non-aws service that never
    // mentions `mcp` is unaffected.
    it('stays out of the way without an mcp block', async () => {
      const serverless = makeNonAwsServerless()
      const plugin = new AwsMcp(serverless, {})
      await expect(plugin.hooks.initialize()).resolves.toBeUndefined()
    })
  })

  it('synthesizes a named function per server on initialize', async () => {
    const serverless = makeServerless()
    serverless.service.mcp = { servers: { crm: { server: 'src/server.mjs' } } }
    const plugin = new AwsMcp(serverless, {})
    await plugin.hooks.initialize()
    expect(serverless.service.functions.crm.name).toBe('acme-dev-crm')
    expect(serverless.service.functions.crm.handler).toBe('src/server.default')
  })

  it('contributes route descriptors to the api gateway compiler', async () => {
    const serverless = makeServerless()
    serverless.service.mcp = { servers: { crm: { server: 'src/server.mjs' } } }
    const plugin = new AwsMcp(serverless, {})
    await plugin.hooks.initialize()
    await plugin.hooks['before:package:compileEvents']()
    const { registerExternalHttpEvents } = apiGatewayPluginOf(serverless)
    expect(registerExternalHttpEvents).toHaveBeenCalledTimes(1)
    const [events] = registerExternalHttpEvents.mock.calls[0]
    expect(Array.isArray(events)).toBe(true)
    expect(events[0].functionName).toBe('crm')
    expect(events[0].http.path).toBe('crm/mcp')
  })

  it('fails with a teaching error when the api gateway plugin is absent', async () => {
    const serverless = makeServerless()
    serverless.pluginManager.plugins = []
    serverless.service.mcp = { servers: { crm: { server: 'src/server.mjs' } } }
    const plugin = new AwsMcp(serverless, {})
    await plugin.hooks.initialize()
    await expect(
      plugin.hooks['before:package:compileEvents'](),
    ).rejects.toMatchObject({ code: 'MCP_API_GATEWAY_PLUGIN_NOT_FOUND' })
  })

  describe('state key provisioning', () => {
    const withState = (state) => ({
      servers: {
        crm: { server: 'src/server.mjs', ...(state ? { state } : {}) },
      },
    })

    // `package:setupProviderConfiguration` (IAM merge) and
    // `package:compileFunctions` (environment) both run before
    // `package:compileEvents`, so the grant and the env var are contributed
    // during `initialize` and only the resources are emitted later.
    it('contributes the IAM grant during initialize', async () => {
      const serverless = makeServerless()
      serverless.service.mcp = withState(true)
      const plugin = new AwsMcp(serverless, {})
      await plugin.hooks.initialize()
      expect(serverless.service.provider.iam.role.statements).toEqual([
        {
          Effect: 'Allow',
          Action: ['secretsmanager:GetSecretValue'],
          Resource: [{ Ref: 'CrmMcpStateSecret' }],
        },
      ])
    })

    it('preserves user-authored provider iam statements', async () => {
      const serverless = makeServerless()
      const userStatement = {
        Effect: 'Allow',
        Action: ['s3:GetObject'],
        Resource: ['arn:aws:s3:::bucket/*'],
      }
      serverless.service.provider.iam = {
        role: { statements: [userStatement] },
      }
      serverless.service.mcp = withState(true)
      const plugin = new AwsMcp(serverless, {})
      await plugin.hooks.initialize()
      const { statements } = serverless.service.provider.iam.role
      expect(statements).toHaveLength(2)
      expect(statements[0]).toBe(userStatement)
    })

    // Both consumers of the modern shape - `mergeIamTemplates` and
    // `rolesPerFunction` - fall back to `provider.iamRoleStatements` only while
    // `provider.iam` is absent, so creating the modern shape here has to carry
    // the legacy statements along or the service loses its own grants.
    it('folds legacy provider.iamRoleStatements into the created iam shape', async () => {
      const serverless = makeServerless()
      const legacyStatement = {
        Effect: 'Allow',
        Action: ['dynamodb:GetItem'],
        Resource: ['arn:aws:dynamodb:us-east-1:123456789012:table/orders'],
      }
      serverless.service.provider.iamRoleStatements = [legacyStatement]
      serverless.service.mcp = withState(true)
      const plugin = new AwsMcp(serverless, {})
      await plugin.hooks.initialize()
      expect(serverless.service.provider.iam.role.statements).toEqual([
        legacyStatement,
        {
          Effect: 'Allow',
          Action: ['secretsmanager:GetSecretValue'],
          Resource: [{ Ref: 'CrmMcpStateSecret' }],
        },
      ])
      // The legacy array itself is left alone, so anything still reading it
      // sees exactly what the user wrote.
      expect(serverless.service.provider.iamRoleStatements).toEqual([
        legacyStatement,
      ])
    })

    it('adds only the mcp statement when neither iam shape is present', async () => {
      const serverless = makeServerless()
      serverless.service.mcp = withState(true)
      const plugin = new AwsMcp(serverless, {})
      await plugin.hooks.initialize()
      expect(serverless.service.provider.iam.role.statements).toHaveLength(1)
      expect(serverless.service.provider.iamRoleStatements).toBeUndefined()
    })

    it('sets the env var reference during initialize', async () => {
      const serverless = makeServerless()
      serverless.service.mcp = withState(true)
      const plugin = new AwsMcp(serverless, {})
      await plugin.hooks.initialize()
      expect(
        serverless.service.functions.crm.environment
          .SERVERLESS_MCP_STATE_KEY_REF,
      ).toEqual({ Ref: 'CrmMcpStateSecret' })
    })

    it('emits the secret and output on before:package:compileEvents', async () => {
      const serverless = makeServerless()
      serverless.service.mcp = withState(true)
      const plugin = new AwsMcp(serverless, {})
      await plugin.hooks.initialize()
      await plugin.hooks['before:package:compileEvents']()
      const template =
        serverless.service.provider.compiledCloudFormationTemplate
      expect(template.Resources.CrmMcpStateSecret).toMatchObject({
        Type: 'AWS::SecretsManager::Secret',
      })
      expect(template.Outputs.CrmMcpStateSecretArn).toEqual({
        Value: { Ref: 'CrmMcpStateSecret' },
      })
      expect(
        serverless.service.functions.crm.environment
          .SERVERLESS_MCP_STATE_KEY_REF,
      ).toEqual({ Ref: 'CrmMcpStateSecret' })
    })

    it('references a BYO key ARN without emitting resources', async () => {
      const serverless = makeServerless()
      const arn = 'arn:aws:ssm:us-east-1:123456789012:parameter/mcp-key'
      serverless.service.mcp = withState(arn)
      const plugin = new AwsMcp(serverless, {})
      await plugin.hooks.initialize()
      await plugin.hooks['before:package:compileEvents']()
      expect(
        serverless.service.functions.crm.environment
          .SERVERLESS_MCP_STATE_KEY_REF,
      ).toBe(arn)
      expect(serverless.service.provider.iam.role.statements).toEqual([
        { Effect: 'Allow', Action: ['ssm:GetParameter'], Resource: [arn] },
      ])
      expect(
        serverless.service.provider.compiledCloudFormationTemplate.Resources,
      ).toEqual({})
    })

    it('contributes nothing to a bring-your-own execution role', async () => {
      const serverless = makeServerless()
      const role = 'arn:aws:iam::123456789012:role/my-role'
      serverless.service.provider.iam = { role }
      serverless.service.mcp = withState(true)
      const plugin = new AwsMcp(serverless, {})
      await plugin.hooks.initialize()
      await plugin.hooks['before:package:compileEvents']()
      expect(serverless.service.provider.iam).toEqual({ role })
      expect(serverless.service.functions.crm.iam).toBeUndefined()
      // The secret is still provisioned and referenced; only the grant is the
      // user's responsibility.
      expect(
        serverless.service.provider.compiledCloudFormationTemplate.Resources
          .CrmMcpStateSecret,
      ).toBeDefined()
    })

    it('contributes nothing under the legacy provider.role spelling', async () => {
      const serverless = makeServerless()
      serverless.service.provider.role = 'arn:aws:iam::123456789012:role/legacy'
      serverless.service.mcp = withState(true)
      const plugin = new AwsMcp(serverless, {})
      await plugin.hooks.initialize()
      expect(serverless.service.provider.iam).toBeUndefined()
      // Without per-function mode the legacy `provider.role` is the single
      // execution role for every function, so nothing lands on the function
      // either.
      expect(serverless.service.functions.crm.iam).toBeUndefined()
    })

    // A state-enabled server must not leak its key into a sibling that never
    // asked for state, and the grant must name that one secret only.
    it('isolates state provisioning to the server that asks for it', async () => {
      const serverless = makeServerless()
      serverless.service.mcp = {
        servers: {
          'billing-api': { server: 'src/billing.mjs', state: true },
          docs: { server: 'src/docs.mjs' },
        },
      }
      const plugin = new AwsMcp(serverless, {})
      await plugin.hooks.initialize()
      await plugin.hooks['before:package:compileEvents']()
      const { functions, provider } = serverless.service
      expect(functions.docs.environment).not.toHaveProperty(
        'SERVERLESS_MCP_STATE_KEY_REF',
      )
      expect(
        functions['billing-api'].environment.SERVERLESS_MCP_STATE_KEY_REF,
      ).toEqual({ Ref: 'BillingDashapiMcpStateSecret' })
      expect(
        Object.keys(provider.compiledCloudFormationTemplate.Resources),
      ).toEqual(['BillingDashapiMcpStateSecret'])
      expect(provider.iam.role.statements).toEqual([
        {
          Effect: 'Allow',
          Action: ['secretsmanager:GetSecretValue'],
          Resource: [{ Ref: 'BillingDashapiMcpStateSecret' }],
        },
      ])
    })

    // `roles-per-function` defaults every generated role to inheriting
    // `provider.iam.role.statements`, so a provider-level grant in
    // `mode: perFunction` would hand every function every server's state key.
    describe('per-function role mode', () => {
      const twoStatefulServers = {
        servers: {
          crm: { server: 'src/crm.mjs', state: true },
          'billing-api': { server: 'src/billing.mjs', state: true },
        },
      }

      it('scopes each grant to the owning function only', async () => {
        const serverless = makeServerless()
        serverless.service.provider.iam = { role: { mode: 'perFunction' } }
        serverless.service.mcp = twoStatefulServers
        const plugin = new AwsMcp(serverless, {})
        await plugin.hooks.initialize()
        const { functions, provider } = serverless.service
        expect(functions.crm.iam.role.statements).toEqual([
          {
            Effect: 'Allow',
            Action: ['secretsmanager:GetSecretValue'],
            Resource: [{ Ref: 'CrmMcpStateSecret' }],
          },
        ])
        expect(functions['billing-api'].iam.role.statements).toEqual([
          {
            Effect: 'Allow',
            Action: ['secretsmanager:GetSecretValue'],
            Resource: [{ Ref: 'BillingDashapiMcpStateSecret' }],
          },
        ])
        expect(provider.iam.role.statements).toBeUndefined()
      })

      it('leaves user-authored provider statements alone', async () => {
        const serverless = makeServerless()
        const userStatement = {
          Effect: 'Allow',
          Action: ['s3:GetObject'],
          Resource: ['arn:aws:s3:::bucket/*'],
        }
        serverless.service.provider.iam = {
          role: { mode: 'perFunction', statements: [userStatement] },
        }
        serverless.service.mcp = twoStatefulServers
        const plugin = new AwsMcp(serverless, {})
        await plugin.hooks.initialize()
        expect(serverless.service.provider.iam.role.statements).toEqual([
          userStatement,
        ])
      })

      // `rolesPerFunction` early-returns for the legacy `provider.role`
      // spelling only while per-function mode is OFF, so this combination does
      // build a generated role per function - and the grant has to reach it, or
      // the deploy succeeds and the server fails at runtime with AccessDenied.
      it('still grants per function under the legacy provider.role spelling', async () => {
        const serverless = makeServerless()
        serverless.service.provider.role =
          'arn:aws:iam::123456789012:role/legacy'
        serverless.service.provider.iam = { role: { mode: 'perFunction' } }
        serverless.service.mcp = withState(true)
        const plugin = new AwsMcp(serverless, {})
        await plugin.hooks.initialize()
        const { functions, provider } = serverless.service
        expect(functions.crm.iam.role.statements).toEqual([
          {
            Effect: 'Allow',
            Action: ['secretsmanager:GetSecretValue'],
            Resource: [{ Ref: 'CrmMcpStateSecret' }],
          },
        ])
        // Only the synthesized function's own IAM is written to.
        expect(provider.iam).toEqual({ role: { mode: 'perFunction' } })
      })

      it('leaves a stateless sibling function without any grant', async () => {
        const serverless = makeServerless()
        serverless.service.provider.iam = { role: { mode: 'perFunction' } }
        serverless.service.mcp = {
          servers: {
            crm: { server: 'src/crm.mjs', state: true },
            docs: { server: 'src/docs.mjs' },
          },
        }
        const plugin = new AwsMcp(serverless, {})
        await plugin.hooks.initialize()
        expect(serverless.service.functions.docs.iam).toBeUndefined()
        expect(
          serverless.service.functions.crm.iam.role.statements,
        ).toHaveLength(1)
      })
    })

    it('touches neither iam nor the environment without state', async () => {
      const serverless = makeServerless()
      serverless.service.mcp = withState(undefined)
      const plugin = new AwsMcp(serverless, {})
      await plugin.hooks.initialize()
      await plugin.hooks['before:package:compileEvents']()
      expect(serverless.service.provider.iam).toBeUndefined()
      expect(serverless.service.functions.crm.environment).not.toHaveProperty(
        'SERVERLESS_MCP_STATE_KEY_REF',
      )
      expect(
        serverless.service.provider.compiledCloudFormationTemplate.Resources,
      ).toEqual({})
    })

    // The check itself is covered in permission-check.test.js; what matters
    // here is that the hook only reaches AWS when there is something a user
    // could act on.
    describe('the deploy-time permission check', () => {
      const byoRole = 'arn:aws:iam::123456789012:role/my-role'
      const secretArn =
        'arn:aws:secretsmanager:us-east-1:123456789012:secret:CrmKey-Ab12Cd'

      const deploy = async (serverless) => {
        const plugin = new AwsMcp(serverless, {})
        await plugin.hooks.initialize()
        await plugin.hooks['after:deploy:deploy']()
        return plugin.provider.request
      }

      beforeEach(() => log.warning.mockClear())

      it('simulates the brought role against the deployed key', async () => {
        const serverless = makeServerless()
        serverless.service.provider.iam = { role: byoRole }
        serverless.service.mcp = withState(true)
        const plugin = new AwsMcp(serverless, {})
        plugin.provider.request.mockImplementation(async (service) =>
          service === 'CloudFormation'
            ? {
                Stacks: [
                  {
                    Outputs: [
                      {
                        OutputKey: 'CrmMcpStateSecretArn',
                        OutputValue: secretArn,
                      },
                    ],
                  },
                ],
              }
            : { EvaluationResults: [{ EvalDecision: 'implicitDeny' }] },
        )
        await plugin.hooks.initialize()
        await plugin.hooks['after:deploy:deploy']()
        expect(plugin.provider.request).toHaveBeenCalledWith(
          'CloudFormation',
          'describeStacks',
          { StackName: 'acme-dev' },
        )
        expect(plugin.provider.request).toHaveBeenCalledWith(
          'IAM',
          'simulatePrincipalPolicy',
          {
            PolicySourceArn: byoRole,
            ActionNames: ['secretsmanager:GetSecretValue'],
            ResourceArns: [secretArn],
          },
        )
        expect(log.warning).toHaveBeenCalledWith(
          expect.stringContaining(secretArn),
        )
      })

      it('does not run for a role the Framework generates', async () => {
        const serverless = makeServerless()
        serverless.service.mcp = withState(true)
        expect(await deploy(serverless)).not.toHaveBeenCalled()
      })

      it('does not run for a role given as a CloudFormation intrinsic', async () => {
        const serverless = makeServerless()
        serverless.service.provider.iam = {
          role: { 'Fn::GetAtt': ['MyRole', 'Arn'] },
        }
        serverless.service.mcp = withState(true)
        expect(await deploy(serverless)).not.toHaveBeenCalled()
      })

      it('does not run for a service with no state-enabled server', async () => {
        const serverless = makeServerless()
        serverless.service.provider.role = byoRole
        serverless.service.mcp = withState(undefined)
        expect(await deploy(serverless)).not.toHaveBeenCalled()
      })

      it('does not run without an mcp block', async () => {
        const serverless = makeServerless()
        serverless.service.provider.role = byoRole
        const plugin = new AwsMcp(serverless, {})
        await plugin.hooks.initialize()
        await plugin.hooks['after:deploy:deploy']()
        expect(plugin.provider.request).not.toHaveBeenCalled()
      })
    })
  })

  describe('endpoint service-output section', () => {
    const twoServers = {
      servers: {
        crm: { server: 'src/crm.mjs' },
        docs: { server: 'src/docs.mjs' },
      },
    }
    const infoPluginOf = (serverless) => serverless.pluginManager.plugins[1]

    beforeEach(() => writeText.mockClear())

    for (const hook of ['after:info:info', 'after:deploy:deploy']) {
      it(`registers one entry per server on ${hook}`, async () => {
        const serverless = makeServerless()
        serverless.service.mcp = twoServers
        const plugin = new AwsMcp(serverless, {})
        await plugin.hooks.initialize()
        await plugin.hooks[hook]()
        expect(serverless.addServiceOutputSection).toHaveBeenCalledTimes(1)
        expect(serverless.addServiceOutputSection).toHaveBeenCalledWith('mcp', [
          `crm → ${serviceEndpoint}/crm/mcp`,
          `docs → ${serviceEndpoint}/docs/mcp`,
        ])
        // The section renderer owns the printing; nothing is written directly,
        // which is what keeps `info --json` a single JSON document.
        expect(writeText).not.toHaveBeenCalled()
      })

      it(`registers nothing on ${hook} without an mcp block`, async () => {
        const serverless = makeServerless()
        const plugin = new AwsMcp(serverless, {})
        await plugin.hooks.initialize()
        await plugin.hooks[hook]()
        expect(serverless.addServiceOutputSection).not.toHaveBeenCalled()
      })
    }

    // The section renderer prints an array as an indented block under the
    // section header and a string inline, so a lone server has to be passed as
    // a bare string to render as `mcp: crm → …` rather than a two-line block.
    it('registers a lone server as a bare string, not a one-entry array', async () => {
      const serverless = makeServerless()
      serverless.service.mcp = { servers: { crm: { server: 'src/crm.mjs' } } }
      const plugin = new AwsMcp(serverless, {})
      await plugin.hooks.initialize()
      await plugin.hooks['after:info:info']()
      expect(serverless.addServiceOutputSection).toHaveBeenCalledWith(
        'mcp',
        `crm → ${serviceEndpoint}/crm/mcp`,
      )
    })

    // `addServiceOutputSection` throws on a duplicate section name, so the
    // registration has to be idempotent even if both hooks fire in one run.
    it('registers the section only once across both hooks', async () => {
      const serverless = makeServerless()
      serverless.service.mcp = twoServers
      const plugin = new AwsMcp(serverless, {})
      await plugin.hooks.initialize()
      await plugin.hooks['after:deploy:deploy']()
      await plugin.hooks['after:info:info']()
      expect(serverless.addServiceOutputSection).toHaveBeenCalledTimes(1)
    })

    // A custom domain is the URL clients are given, and with
    // `disableDefaultEndpoint` the execute-api one does not answer at all - so
    // printing it would hand out an address that does not work. The derivation
    // is the same one `SERVERLESS_MCP_PUBLIC_BASE_URL` uses.
    it('prints the custom domain instead of the execute-api URL', async () => {
      const serverless = makeServerless()
      serverless.service.provider.domain = {
        name: 'api.acme.com',
        basePath: 'assistant',
      }
      serverless.service.mcp = twoServers
      const plugin = new AwsMcp(serverless, {})
      await plugin.hooks.initialize()
      await plugin.hooks['after:deploy:deploy']()
      expect(serverless.addServiceOutputSection).toHaveBeenCalledWith('mcp', [
        'crm → https://api.acme.com/assistant/crm/mcp',
        'docs → https://api.acme.com/assistant/docs/mcp',
      ])
    })

    it('prints the custom domain even with no stack outputs gathered', async () => {
      const serverless = makeServerless()
      serverless.service.provider.domains = ['mcp.acme.com']
      infoPluginOf(serverless).gatheredData.outputs = []
      serverless.service.mcp = { servers: { crm: { server: 'src/crm.mjs' } } }
      const plugin = new AwsMcp(serverless, {})
      await plugin.hooks.initialize()
      await plugin.hooks['after:deploy:deploy']()
      expect(serverless.addServiceOutputSection).toHaveBeenCalledWith(
        'mcp',
        'crm → https://mcp.acme.com/crm/mcp',
      )
    })

    // The documented escape hatch for a service the Framework cannot derive an
    // origin for (a CloudFront distribution, two REST domains): the server names
    // its own, and that is the URL it advertises to clients - so it has to be the
    // URL the summary prints, per server rather than for the whole service.
    it('prints a server-level SERVERLESS_MCP_PUBLIC_BASE_URL over the domain', async () => {
      const serverless = makeServerless()
      serverless.service.provider.domain = { name: 'api.acme.com' }
      serverless.service.mcp = {
        servers: {
          crm: {
            server: 'src/crm.mjs',
            environment: {
              SERVERLESS_MCP_PUBLIC_BASE_URL: 'https://mcp.acme.com',
            },
          },
          docs: { server: 'src/docs.mjs' },
        },
      }
      const plugin = new AwsMcp(serverless, {})
      await plugin.hooks.initialize()
      await plugin.hooks['after:deploy:deploy']()
      expect(serverless.addServiceOutputSection).toHaveBeenCalledWith('mcp', [
        'crm → https://mcp.acme.com/crm/mcp',
        'docs → https://api.acme.com/docs/mcp',
      ])
    })

    it('registers nothing when the stack has no service endpoint output', async () => {
      const serverless = makeServerless()
      infoPluginOf(serverless).gatheredData.outputs = []
      serverless.service.mcp = twoServers
      const plugin = new AwsMcp(serverless, {})
      await plugin.hooks.initialize()
      await plugin.hooks['after:info:info']()
      expect(serverless.addServiceOutputSection).not.toHaveBeenCalled()
    })

    it('registers nothing when no plugin gathered stack outputs', async () => {
      const serverless = makeServerless()
      serverless.pluginManager.plugins = [
        { registerExternalHttpEvents: jest.fn() },
      ]
      serverless.service.mcp = twoServers
      const plugin = new AwsMcp(serverless, {})
      await plugin.hooks.initialize()
      await plugin.hooks['after:deploy:deploy']()
      expect(serverless.addServiceOutputSection).not.toHaveBeenCalled()
    })

    // Older `Serverless` instances (and plugin-manager stubs) may not expose
    // the seam at all; the summary is optional, the command is not.
    it('tolerates a Serverless instance without the seam', async () => {
      const serverless = makeServerless()
      delete serverless.addServiceOutputSection
      serverless.service.mcp = twoServers
      const plugin = new AwsMcp(serverless, {})
      await plugin.hooks.initialize()
      // The hook is async — an `expect(fn).not.toThrow()` would only see a
      // synchronous throw and let a rejection pass the test.
      await expect(
        plugin.hooks['after:deploy:deploy'](),
      ).resolves.toBeUndefined()
    })
  })

  // Staging the prebuilt entry, repointing the handler at it, and telling it
  // where the user's module ended up. The unit-level mechanics live in
  // `packaging.test.js`; these are the hook wiring and the mode detection.
  describe('packaging integration', () => {
    const oneServer = { servers: { crm: { server: 'src/server.mjs' } } }
    const stagedEntry = () =>
      path.join(serviceDir, 'serverless-mcp', 'entry.mjs')
    let entrySource

    beforeAll(async () => {
      entrySource = path.join(serviceDir, 'prebuilt-entry.mjs')
      await writeFile(entrySource, 'export const handler = () => {}\n')
    })

    afterEach(async () => {
      await rm(path.join(serviceDir, 'serverless-mcp'), {
        recursive: true,
        force: true,
      })
      // Written only by the tests that need esbuild's zero-config extension
      // probe to find a real file, and removed here so the others keep seeing
      // an empty service dir.
      await rm(path.join(serviceDir, 'src'), { recursive: true, force: true })
      await rm(path.join(serviceDir, 'package.json'), { force: true })
      log.warning.mockClear()
    })

    // The plugin resolves the entry inside its own package; the tests point it
    // at a fixture instead, because the real one is a build product.
    const makePlugin = (serverless, options = {}) => {
      const plugin = new AwsMcp(serverless, options)
      plugin.entrySourcePath = entrySource
      return plugin
    }

    // Mirrors the real hook order: the esbuild plugin freezes its build set and
    // its build properties during `before:package:createDeploymentArtifacts`,
    // which runs before either swap point.
    const withEsbuild = async (serverless) => {
      const esbuildPlugin = new Esbuild(serverless, {})
      serverless.pluginManager.plugins.push(esbuildPlugin)
      await esbuildPlugin._shouldRun()
      return esbuildPlugin
    }

    it('registers the staging, swap and cleanup hooks', () => {
      const plugin = makePlugin(makeServerless())
      for (const hook of [
        'before:package:createDeploymentArtifacts',
        'before:package:compileFunctions',
        'before:deploy:function:packageFunction',
        'after:deploy:function:packageFunction',
        'finalize',
        'error',
      ]) {
        expect(plugin.hooks[hook]).toBeInstanceOf(Function)
      }
    })

    it('stages the entry and registers its packaging pattern', async () => {
      const serverless = makeServerless()
      serverless.service.mcp = oneServer
      const plugin = makePlugin(serverless)
      await plugin.hooks.initialize()
      await plugin.hooks['before:package:createDeploymentArtifacts']()
      expect(await readFile(stagedEntry(), 'utf8')).toBe(
        'export const handler = () => {}\n',
      )
      expect(serverless.service.package.patterns).toEqual(['serverless-mcp/**'])
    })

    it('stages nothing without an mcp block', async () => {
      const serverless = makeServerless()
      const plugin = makePlugin(serverless)
      await plugin.hooks.initialize()
      await plugin.hooks['before:package:createDeploymentArtifacts']()
      expect(existsSync(stagedEntry())).toBe(false)
      expect(serverless.service.package.patterns).toBeUndefined()
    })

    // A user-provided artifact is deployed verbatim: the classic packager
    // early-returns on it, so `package.patterns` is never evaluated and the
    // staged entry reaches no zip - while the handler is still swapped to it, so
    // every invoke dies with ERR_MODULE_NOT_FOUND. There is no packaging step
    // this integration can hook to fix that, hence a teaching error instead.
    describe('a service deployed from a prebuilt artifact', () => {
      it('fails before anything is staged or swapped', async () => {
        const serverless = makeServerless()
        serverless.service.mcp = oneServer
        serverless.service.package = { artifact: 'dist/app.zip' }
        const plugin = makePlugin(serverless)
        await plugin.hooks.initialize()
        await expect(
          plugin.hooks['before:package:createDeploymentArtifacts'](),
        ).rejects.toMatchObject({
          code: 'MCP_PREBUILT_ARTIFACT_UNSUPPORTED',
          message: expect.stringContaining('package.artifact'),
        })
        expect(existsSync(stagedEntry())).toBe(false)
        expect(serverless.service.functions.crm.handler).toBe(
          'src/server.default',
        )
      })

      it('names the server and the artifact', async () => {
        const serverless = makeServerless()
        serverless.service.mcp = oneServer
        serverless.service.package = { artifact: 'dist/app.zip' }
        const plugin = makePlugin(serverless)
        await plugin.hooks.initialize()
        await expect(
          plugin.hooks['before:package:createDeploymentArtifacts'](),
        ).rejects.toMatchObject({
          message: expect.stringMatching(/"crm".*dist\/app\.zip/s),
        })
      })

      // The service-level artifact wins for a function that does not set
      // `package.individually` itself, and an MCP server function is
      // synthesized - it has no `package` block to set it in.
      it('fails even when the service packages individually', async () => {
        const serverless = makeServerless()
        serverless.service.mcp = oneServer
        serverless.service.package = {
          artifact: 'dist/app.zip',
          individually: true,
        }
        const plugin = makePlugin(serverless)
        await plugin.hooks.initialize()
        await expect(
          plugin.hooks['before:package:createDeploymentArtifacts'](),
        ).rejects.toMatchObject({
          code: 'MCP_PREBUILT_ARTIFACT_UNSUPPORTED',
        })
      })

      // Unreachable through `serverless.yml` today - the mcp schema has no
      // `package` key and a same-named `functions` entry is rejected as a
      // logical-id collision - so this guards the seam a plugin could reach.
      it('fails for an artifact set on the server function itself', async () => {
        const serverless = makeServerless()
        serverless.service.mcp = oneServer
        const plugin = makePlugin(serverless)
        await plugin.hooks.initialize()
        serverless.service.functions.crm.package = { artifact: 'dist/crm.zip' }
        await expect(
          plugin.hooks['before:package:createDeploymentArtifacts'](),
        ).rejects.toMatchObject({
          code: 'MCP_PREBUILT_ARTIFACT_UNSUPPORTED',
          message: expect.stringContaining('dist/crm.zip'),
        })
      })

      it('ignores an artifact set on an unrelated function', async () => {
        const serverless = makeServerless()
        serverless.service.functions = {
          api: { handler: 'src/api.handler', package: { artifact: 'a.zip' } },
        }
        serverless.service.mcp = oneServer
        const plugin = makePlugin(serverless)
        await plugin.hooks.initialize()
        await plugin.hooks['before:package:createDeploymentArtifacts']()
        expect(existsSync(stagedEntry())).toBe(true)
      })

      // esbuild sets `service.package.artifact` itself while zipping, on the
      // same event - the guard sees only what the user configured because this
      // plugin's hook runs first.
      it('stays out of the way of the bundler own artifact', async () => {
        const serverless = makeServerless()
        serverless.service.build = 'esbuild'
        serverless.service.mcp = oneServer
        const plugin = makePlugin(serverless)
        await plugin.hooks.initialize()
        await plugin.hooks['before:package:createDeploymentArtifacts']()
        serverless.service.package.artifact = '.serverless/acme.zip'
        await withEsbuild(serverless)
        await plugin.hooks['before:package:compileFunctions']()
        expect(serverless.service.functions.crm.handler).toBe(
          'serverless-mcp/entry.handler',
        )
      })

      it('fails the deploy function path for an mcp target', async () => {
        const serverless = makeServerless()
        serverless.service.mcp = oneServer
        serverless.service.package = { artifact: 'dist/app.zip' }
        const plugin = makePlugin(serverless, { function: 'crm' })
        await plugin.hooks.initialize()
        await expect(
          plugin.hooks['before:deploy:function:packageFunction'](),
        ).rejects.toMatchObject({
          code: 'MCP_PREBUILT_ARTIFACT_UNSUPPORTED',
        })
      })

      it('leaves the deploy function path alone for another target', async () => {
        const serverless = makeServerless()
        serverless.service.functions = { api: { handler: 'src/api.handler' } }
        serverless.service.mcp = oneServer
        serverless.service.package = { artifact: 'dist/app.zip' }
        const plugin = makePlugin(serverless, { function: 'api' })
        await plugin.hooks.initialize()
        await expect(
          plugin.hooks['before:deploy:function:packageFunction'](),
        ).resolves.toBeUndefined()
      })
    })

    it('fails with a teaching error when the entry was never built', async () => {
      const serverless = makeServerless()
      serverless.service.mcp = oneServer
      const plugin = makePlugin(serverless)
      plugin.entrySourcePath = path.join(serviceDir, 'never-built.mjs')
      await plugin.hooks.initialize()
      await expect(
        plugin.hooks['before:package:createDeploymentArtifacts'](),
      ).rejects.toMatchObject({
        code: 'MCP_ENTRY_BUNDLE_MISSING',
        message: expect.stringContaining('npm run build:mcp:entry'),
      })
    })

    // Cleanup is per command run, not per packaging event: `finalize` ends a
    // successful run and `error` a failed one, and between them they cover
    // `package`, `deploy` and `deploy function`.
    for (const hook of ['finalize', 'error']) {
      it(`removes the staged entry on ${hook}`, async () => {
        const serverless = makeServerless()
        serverless.service.mcp = oneServer
        const plugin = makePlugin(serverless)
        await plugin.hooks.initialize()
        await plugin.hooks['before:package:createDeploymentArtifacts']()
        await plugin.hooks[hook]()
        expect(existsSync(path.join(serviceDir, 'serverless-mcp'))).toBe(false)
      })

      // Those same hooks fire for `info`, `remove` and every other command an
      // mcp service runs, none of which stage anything - and the staged path is
      // one a service is free to have authored itself.
      it(`leaves a user-authored entry alone on ${hook} when nothing was staged`, async () => {
        const serverless = makeServerless()
        serverless.service.mcp = oneServer
        const plugin = makePlugin(serverless)
        await plugin.hooks.initialize()
        await mkdir(path.dirname(stagedEntry()), { recursive: true })
        await writeFile(stagedEntry(), 'export const handler = mine\n')
        await plugin.hooks[hook]()
        expect(await readFile(stagedEntry(), 'utf8')).toBe(
          'export const handler = mine\n',
        )
      })
    }

    it('repoints the handler at the staged entry', async () => {
      const serverless = makeServerless()
      serverless.service.mcp = oneServer
      const plugin = makePlugin(serverless)
      await plugin.hooks.initialize()
      await plugin.hooks['before:package:compileFunctions']()
      expect(serverless.service.functions.crm.handler).toBe(
        'serverless-mcp/entry.handler',
      )
    })

    // Classic packaging zips the source file verbatim, so the configured path
    // is already the path inside the artifact.
    it('leaves the module path alone when nothing bundles the function', async () => {
      const serverless = makeServerless()
      serverless.service.mcp = oneServer
      const plugin = makePlugin(serverless)
      await plugin.hooks.initialize()
      await withEsbuild(serverless)
      await plugin.hooks['before:package:compileFunctions']()
      expect(
        serverless.service.functions.crm.environment
          .SERVERLESS_MCP_SERVER_MODULE,
      ).toBe('src/server.mjs')
    })

    it('rewrites the module path to esbuild default output', async () => {
      const serverless = makeServerless()
      serverless.service.build = 'esbuild'
      serverless.service.mcp = oneServer
      const plugin = makePlugin(serverless)
      await plugin.hooks.initialize()
      await withEsbuild(serverless)
      await plugin.hooks['before:package:compileFunctions']()
      expect(
        serverless.service.functions.crm.environment
          .SERVERLESS_MCP_SERVER_MODULE,
      ).toBe('src/server.js')
    })

    it('follows a configured esbuild outExtension', async () => {
      const serverless = makeServerless()
      serverless.service.build = {
        esbuild: { format: 'esm', outExtension: { '.js': '.mjs' } },
      }
      serverless.service.mcp = { servers: { crm: { server: 'src/server.ts' } } }
      const plugin = makePlugin(serverless)
      await plugin.hooks.initialize()
      await withEsbuild(serverless)
      await plugin.hooks['before:package:compileFunctions']()
      expect(
        serverless.service.functions.crm.environment
          .SERVERLESS_MCP_SERVER_MODULE,
      ).toBe('src/server.mjs')
    })

    it('rewrites a TypeScript source path to the emitted JavaScript', async () => {
      const serverless = makeServerless()
      serverless.service.build = 'esbuild'
      serverless.service.mcp = { servers: { crm: { server: 'src/server.ts' } } }
      const plugin = makePlugin(serverless)
      await plugin.hooks.initialize()
      await withEsbuild(serverless)
      await plugin.hooks['before:package:compileFunctions']()
      expect(
        serverless.service.functions.crm.environment
          .SERVERLESS_MCP_SERVER_MODULE,
      ).toBe('src/server.js')
    })

    it('rewrites every server, one mode at a time', async () => {
      const serverless = makeServerless()
      serverless.service.build = 'esbuild'
      serverless.service.mcp = {
        servers: {
          crm: { server: 'src/crm.mjs' },
          docs: { server: 'src/docs.mjs' },
        },
      }
      const plugin = makePlugin(serverless)
      await plugin.hooks.initialize()
      await withEsbuild(serverless)
      await plugin.hooks['before:package:compileFunctions']()
      const { functions } = serverless.service
      expect(functions.crm.environment.SERVERLESS_MCP_SERVER_MODULE).toBe(
        'src/crm.js',
      )
      expect(functions.docs.environment.SERVERLESS_MCP_SERVER_MODULE).toBe(
        'src/docs.js',
      )
      expect(functions.docs.handler).toBe('serverless-mcp/entry.handler')
    })

    // Zero-config esbuild bundles a TypeScript entry and leaves a `.mjs` one
    // to the classic packager (`_shouldBuildFunction`) - but a service that
    // bundles anything gets `package.artifact` set, which makes the classic
    // packager early-return, so the unbundled server's own file reaches no zip.
    describe('a service that bundles some servers but not others', () => {
      const writeSources = async () => {
        await mkdir(path.join(serviceDir, 'src'), { recursive: true })
        await writeFile(
          path.join(serviceDir, 'src', 'crm.ts'),
          'export default {}\n',
        )
        await writeFile(
          path.join(serviceDir, 'src', 'docs.mjs'),
          'export default {}\n',
        )
      }

      const mixedServers = {
        servers: {
          crm: { server: 'src/crm.ts' },
          docs: { server: 'src/docs.mjs' },
        },
      }

      it('pins each server to the module path its own mode produces', async () => {
        await writeSources()
        const serverless = makeServerless()
        serverless.service.mcp = mixedServers
        const plugin = makePlugin(serverless)
        await plugin.hooks.initialize()
        await withEsbuild(serverless)
        await plugin.hooks['before:package:compileFunctions']()
        const { functions } = serverless.service
        expect(functions.crm.environment.SERVERLESS_MCP_SERVER_MODULE).toBe(
          'src/crm.js',
        )
        expect(functions.docs.environment.SERVERLESS_MCP_SERVER_MODULE).toBe(
          'src/docs.mjs',
        )
      })

      it('warns about the unbundled server by name', async () => {
        await writeSources()
        const serverless = makeServerless()
        serverless.service.mcp = mixedServers
        const plugin = makePlugin(serverless)
        await plugin.hooks.initialize()
        await withEsbuild(serverless)
        await plugin.hooks['before:package:compileFunctions']()
        const messages = log.warning.mock.calls.map(([message]) => message)
        expect(
          messages.some(
            (message) =>
              message.includes('"docs"') && message.includes('build.esbuild'),
          ),
        ).toBe(true)
      })

      it('stays quiet when every server is bundled', async () => {
        await writeSources()
        const serverless = makeServerless()
        serverless.service.build = 'esbuild'
        serverless.service.mcp = mixedServers
        const plugin = makePlugin(serverless)
        await plugin.hooks.initialize()
        await withEsbuild(serverless)
        await plugin.hooks['before:package:compileFunctions']()
        expect(log.warning).not.toHaveBeenCalled()
      })

      it('stays quiet when nothing is bundled', async () => {
        const serverless = makeServerless()
        serverless.service.mcp = {
          servers: {
            crm: { server: 'src/crm.mjs' },
            docs: { server: 'src/docs.mjs' },
          },
        }
        const plugin = makePlugin(serverless)
        await plugin.hooks.initialize()
        await withEsbuild(serverless)
        await plugin.hooks['before:package:compileFunctions']()
        expect(log.warning).not.toHaveBeenCalled()
      })
    })

    // The worst case of the same breakage, and the one nothing in the mcp block
    // hints at: it is a function of the USER'S own that pulls esbuild in, while
    // every MCP server stays unbundled. The bundler still sets the service-level
    // `package.artifact`, the classic packager still early-returns on it, and no
    // MCP server's file reaches any zip.
    describe('a service where only a non-MCP function is bundled', () => {
      const writeSources = async () => {
        await mkdir(path.join(serviceDir, 'src'), { recursive: true })
        await writeFile(
          path.join(serviceDir, 'src', 'api.ts'),
          'export const handler = () => {}\n',
        )
        await writeFile(
          path.join(serviceDir, 'src', 'docs.mjs'),
          'export default {}\n',
        )
      }

      const withTypeScriptFunction = (serverless) => {
        serverless.service.functions.api = {
          name: 'acme-dev-api',
          handler: 'src/api.handler',
          runtime: 'nodejs22.x',
        }
        return serverless
      }

      const withJavaScriptFunction = (serverless) => {
        serverless.service.functions.plain = {
          name: 'acme-dev-plain',
          handler: 'src/plain.handler',
          runtime: 'nodejs22.x',
        }
        return serverless
      }

      it('warns about every unbundled server by name', async () => {
        await writeSources()
        const serverless = withTypeScriptFunction(makeServerless())
        serverless.service.mcp = {
          servers: { docs: { server: 'src/docs.mjs' } },
        }
        const plugin = makePlugin(serverless)
        await plugin.hooks.initialize()
        await withEsbuild(serverless)
        await plugin.hooks['before:package:compileFunctions']()
        const messages = log.warning.mock.calls.map(([message]) => message)
        expect(
          messages.some(
            (message) =>
              message.includes('"docs"') && message.includes('build.esbuild'),
          ),
        ).toBe(true)
      })

      it('stays quiet when every server is bundled alongside it', async () => {
        await writeSources()
        await writeFile(
          path.join(serviceDir, 'src', 'notes.ts'),
          'export default {}\n',
        )
        const serverless = withTypeScriptFunction(makeServerless())
        serverless.service.mcp = {
          servers: { notes: { server: 'src/notes.ts' } },
        }
        const plugin = makePlugin(serverless)
        await plugin.hooks.initialize()
        await withEsbuild(serverless)
        await plugin.hooks['before:package:compileFunctions']()
        expect(log.warning).not.toHaveBeenCalled()
      })

      it('stays quiet when that function is not bundled either', async () => {
        await writeSources()
        await writeFile(
          path.join(serviceDir, 'src', 'plain.mjs'),
          'export const handler = () => {}\n',
        )
        const serverless = withJavaScriptFunction(makeServerless())
        serverless.service.mcp = {
          servers: { docs: { server: 'src/docs.mjs' } },
        }
        const plugin = makePlugin(serverless)
        await plugin.hooks.initialize()
        await withEsbuild(serverless)
        await plugin.hooks['before:package:compileFunctions']()
        expect(log.warning).not.toHaveBeenCalled()
      })

      // Under `package.individually` the bundler zips per function and sets
      // per-function artifacts, so an unbundled server keeps none - the classic
      // packager still builds its own zip and its file is in it.
      it('stays quiet when the service packages individually', async () => {
        await writeSources()
        const serverless = withTypeScriptFunction(makeServerless())
        serverless.service.package = { individually: true }
        serverless.service.mcp = {
          servers: { docs: { server: 'src/docs.mjs' } },
        }
        const plugin = makePlugin(serverless)
        await plugin.hooks.initialize()
        await withEsbuild(serverless)
        await plugin.hooks['before:package:compileFunctions']()
        expect(log.warning).not.toHaveBeenCalled()
      })
    })

    // The module path is derived from the handler in esbuild mode, so a second
    // pass over an already-swapped function would derive it from the entry.
    it('leaves an already-repointed function alone', async () => {
      const serverless = makeServerless()
      serverless.service.build = 'esbuild'
      serverless.service.mcp = oneServer
      const plugin = makePlugin(serverless)
      await plugin.hooks.initialize()
      await withEsbuild(serverless)
      await plugin.hooks['before:package:compileFunctions']()
      await plugin.hooks['before:package:compileFunctions']()
      const { crm } = serverless.service.functions
      expect(crm.environment.SERVERLESS_MCP_SERVER_MODULE).toBe('src/server.js')
      expect(crm.handler).toBe('serverless-mcp/entry.handler')
    })

    // Dev mode builds its own artifact and owns the handler of every Node
    // function it redirects, so the whole integration stands down.
    describe('under dev mode', () => {
      const makeDevServerless = () => {
        const serverless = makeServerless()
        serverless.devmodeEnabled = true
        serverless.service.mcp = oneServer
        return serverless
      }

      it('stages nothing', async () => {
        const serverless = makeDevServerless()
        const plugin = makePlugin(serverless)
        await plugin.hooks.initialize()
        await plugin.hooks['before:package:createDeploymentArtifacts']()
        expect(existsSync(stagedEntry())).toBe(false)
        expect(serverless.service.package.patterns).toBeUndefined()
      })

      it('leaves the handler and the module path alone', async () => {
        const serverless = makeDevServerless()
        const plugin = makePlugin(serverless)
        await plugin.hooks.initialize()
        await plugin.hooks['before:package:compileFunctions']()
        expect(serverless.service.functions.crm.handler).toBe(
          'src/server.default',
        )
        expect(
          serverless.service.functions.crm.environment
            .SERVERLESS_MCP_SERVER_MODULE,
        ).toBe('src/server.mjs')
      })

      // Standing down silently deploys a function that cannot serve MCP, so the
      // stand-down is said out loud - once, not once per hook.
      it('says once that MCP servers are unsupported here', async () => {
        const serverless = makeDevServerless()
        const plugin = makePlugin(serverless)
        await plugin.hooks.initialize()
        await plugin.hooks['before:package:createDeploymentArtifacts']()
        await plugin.hooks['before:package:compileFunctions']()
        expect(log.warning).toHaveBeenCalledTimes(1)
        expect(log.warning).toHaveBeenCalledWith(
          expect.stringContaining('Dev Mode'),
        )
      })

      it('says nothing without an mcp block', async () => {
        const serverless = makeServerless()
        serverless.devmodeEnabled = true
        const plugin = makePlugin(serverless)
        await plugin.hooks.initialize()
        await plugin.hooks['before:package:createDeploymentArtifacts']()
        await plugin.hooks['before:package:compileFunctions']()
        expect(log.warning).not.toHaveBeenCalled()
      })
    })

    describe('custom domain public base URL', () => {
      it('is set on every server function', async () => {
        const serverless = makeServerless()
        serverless.service.provider.domain = {
          name: 'api.acme.com',
          basePath: 'assistant',
        }
        serverless.service.mcp = {
          servers: {
            crm: { server: 'src/crm.mjs' },
            docs: { server: 'src/docs.mjs' },
          },
        }
        const plugin = makePlugin(serverless)
        await plugin.hooks.initialize()
        await plugin.hooks['before:package:compileFunctions']()
        for (const name of ['crm', 'docs']) {
          expect(
            serverless.service.functions[name].environment
              .SERVERLESS_MCP_PUBLIC_BASE_URL,
          ).toBe('https://api.acme.com/assistant')
        }
      })

      // The derived value is a convenience; a value the user wrote for this
      // server is a decision, and it is what the entry has to honor.
      it('does not overwrite a value the user set on the server', async () => {
        const serverless = makeServerless()
        serverless.service.provider.domain = { name: 'api.acme.com' }
        serverless.service.mcp = {
          servers: {
            crm: {
              server: 'src/crm.mjs',
              environment: {
                SERVERLESS_MCP_PUBLIC_BASE_URL: 'https://mine.example.com/mcp',
              },
            },
          },
        }
        const plugin = makePlugin(serverless)
        await plugin.hooks.initialize()
        await plugin.hooks['before:package:compileFunctions']()
        expect(
          serverless.service.functions.crm.environment
            .SERVERLESS_MCP_PUBLIC_BASE_URL,
        ).toBe('https://mine.example.com/mcp')
      })

      it('is absent without a custom domain', async () => {
        const serverless = makeServerless()
        serverless.service.mcp = oneServer
        const plugin = makePlugin(serverless)
        await plugin.hooks.initialize()
        await plugin.hooks['before:package:compileFunctions']()
        expect(serverless.service.functions.crm.environment).not.toHaveProperty(
          'SERVERLESS_MCP_PUBLIC_BASE_URL',
        )
      })
    })

    describe('dev-dependency warning', () => {
      const writeDevDependency = () =>
        writeFile(
          path.join(serviceDir, 'package.json'),
          JSON.stringify({ devDependencies: { zod: '^4.4.3' } }),
        )

      it('fires for an unbundled server', async () => {
        await writeDevDependency()
        const serverless = makeServerless()
        serverless.service.mcp = oneServer
        const plugin = makePlugin(serverless)
        await plugin.hooks.initialize()
        await plugin.hooks['before:package:compileFunctions']()
        expect(log.warning).toHaveBeenCalledWith(expect.stringContaining('zod'))
      })

      // esbuild bundles the user's imports into the output, so where the
      // dependency was declared stops mattering.
      it('stays quiet when esbuild bundles the server', async () => {
        await writeDevDependency()
        const serverless = makeServerless()
        serverless.service.build = 'esbuild'
        serverless.service.mcp = oneServer
        const plugin = makePlugin(serverless)
        await plugin.hooks.initialize()
        await withEsbuild(serverless)
        await plugin.hooks['before:package:compileFunctions']()
        expect(log.warning).not.toHaveBeenCalled()
      })
    })

    // `deploy function` packages and deploys one function, and reads its
    // handler an event later than `compileFunctions` ever runs.
    describe('the deploy function path', () => {
      const twoServers = {
        servers: {
          crm: { server: 'src/crm.mjs' },
          docs: { server: 'src/docs.mjs' },
        },
      }

      it('stages the entry for the single-function package', async () => {
        const serverless = makeServerless()
        serverless.service.mcp = twoServers
        const plugin = makePlugin(serverless, { function: 'crm' })
        await plugin.hooks.initialize()
        await plugin.hooks['before:deploy:function:packageFunction']()
        expect(existsSync(stagedEntry())).toBe(true)
      })

      // The staged entry and the pattern that carries it only belong in an
      // artifact built for an MCP server; `deploy function` on anything else
      // would otherwise ship the entry inside an unrelated function's zip.
      it('stages nothing when the target is not an mcp server', async () => {
        const serverless = makeServerless()
        serverless.service.functions = { api: { handler: 'src/api.handler' } }
        serverless.service.mcp = twoServers
        const plugin = makePlugin(serverless, { function: 'api' })
        await plugin.hooks.initialize()
        await plugin.hooks['before:deploy:function:packageFunction']()
        expect(existsSync(stagedEntry())).toBe(false)
        expect(serverless.service.package.patterns).toBeUndefined()
      })

      it('repoints only the targeted function', async () => {
        const serverless = makeServerless()
        serverless.service.mcp = twoServers
        const plugin = makePlugin(serverless, { function: 'crm' })
        await plugin.hooks.initialize()
        await plugin.hooks['after:deploy:function:packageFunction']()
        const { functions } = serverless.service
        expect(functions.crm.handler).toBe('serverless-mcp/entry.handler')
        expect(functions.docs.handler).toBe('src/docs.default')
      })

      it('cleans up once the run finishes', async () => {
        const serverless = makeServerless()
        serverless.service.mcp = twoServers
        const plugin = makePlugin(serverless, { function: 'crm' })
        await plugin.hooks.initialize()
        await plugin.hooks['before:deploy:function:packageFunction']()
        await plugin.hooks.finalize()
        expect(existsSync(path.join(serviceDir, 'serverless-mcp'))).toBe(false)
      })

      // `updateFunctionConfiguration` drops the WHOLE environment update when
      // any value is a non-string object (`../deploy-function.js`, the
      // `params.Environment.Variables` / `_.isObject` check) - and `state: true`
      // puts a `{Ref}` there. The code is updated, the environment silently is
      // not, so the skip is said out loud rather than discovered at runtime.
      describe('a stateful server target', () => {
        const statefulServers = {
          servers: {
            crm: { server: 'src/crm.mjs', state: true },
            docs: { server: 'src/docs.mjs' },
          },
        }

        for (const hook of [
          'before:deploy:function:packageFunction',
          'after:deploy:function:packageFunction',
        ]) {
          it(`warns that the environment is not updated on ${hook}`, async () => {
            const serverless = makeServerless()
            serverless.service.mcp = statefulServers
            const plugin = makePlugin(serverless, { function: 'crm' })
            await plugin.hooks.initialize()
            await plugin.hooks[hook]()
            expect(log.warning).toHaveBeenCalledWith(
              expect.stringContaining('deploy function'),
            )
            expect(log.warning).toHaveBeenCalledWith(
              expect.stringContaining('state: true'),
            )
          })
        }

        it('warns once across both hooks of a run', async () => {
          const serverless = makeServerless()
          serverless.service.mcp = statefulServers
          const plugin = makePlugin(serverless, { function: 'crm' })
          await plugin.hooks.initialize()
          await plugin.hooks['before:deploy:function:packageFunction']()
          await plugin.hooks['after:deploy:function:packageFunction']()
          expect(log.warning).toHaveBeenCalledTimes(1)
        })

        it('stays quiet for a stateless server target', async () => {
          const serverless = makeServerless()
          serverless.service.mcp = statefulServers
          const plugin = makePlugin(serverless, { function: 'docs' })
          await plugin.hooks.initialize()
          await plugin.hooks['before:deploy:function:packageFunction']()
          await plugin.hooks['after:deploy:function:packageFunction']()
          expect(log.warning).not.toHaveBeenCalled()
        })

        it('stays quiet for a target that is not an mcp server', async () => {
          const serverless = makeServerless()
          serverless.service.functions = { api: { handler: 'src/api.handler' } }
          serverless.service.mcp = statefulServers
          const plugin = makePlugin(serverless, { function: 'api' })
          await plugin.hooks.initialize()
          await plugin.hooks['before:deploy:function:packageFunction']()
          await plugin.hooks['after:deploy:function:packageFunction']()
          expect(log.warning).not.toHaveBeenCalled()
        })

        // A full `deploy` writes the environment through CloudFormation, so
        // nothing is skipped and there is nothing to say.
        it('stays quiet on the package path', async () => {
          const serverless = makeServerless()
          serverless.service.mcp = statefulServers
          const plugin = makePlugin(serverless)
          await plugin.hooks.initialize()
          await plugin.hooks['before:package:createDeploymentArtifacts']()
          await plugin.hooks['before:package:compileFunctions']()
          expect(log.warning).not.toHaveBeenCalled()
        })
      })
    })

    // `package.patterns` at service level merges into EVERY per-function zip
    // (the classic packager's `getIncludes`, and the esbuild plugin's union of
    // service and function includes), so under `individually` the 2 MB entry
    // would ride along in functions that have no use for it.
    describe('under individual packaging', () => {
      it('carries the entry pattern per mcp server function', async () => {
        const serverless = makeServerless()
        serverless.service.functions = { api: { handler: 'src/api.handler' } }
        serverless.service.package = { individually: true }
        serverless.service.mcp = {
          servers: {
            crm: { server: 'src/crm.mjs' },
            docs: { server: 'src/docs.mjs' },
          },
        }
        const plugin = makePlugin(serverless)
        await plugin.hooks.initialize()
        await plugin.hooks['before:package:createDeploymentArtifacts']()
        const { functions, package: servicePackage } = serverless.service
        for (const name of ['crm', 'docs']) {
          expect(functions[name].package.patterns).toEqual([
            'serverless-mcp/**',
          ])
        }
        expect(servicePackage.patterns).toBeUndefined()
        expect(functions.api.package).toBeUndefined()
      })

      it('preserves a pattern list the function already carries', async () => {
        const serverless = makeServerless()
        serverless.service.package = { individually: true }
        serverless.service.mcp = oneServer
        const plugin = makePlugin(serverless)
        await plugin.hooks.initialize()
        serverless.service.functions.crm.package = { patterns: ['prompts/**'] }
        await plugin.hooks['before:package:createDeploymentArtifacts']()
        expect(serverless.service.functions.crm.package.patterns).toEqual([
          'prompts/**',
          'serverless-mcp/**',
        ])
      })

      it('adds the pattern only to the deploy function target', async () => {
        const serverless = makeServerless()
        serverless.service.package = { individually: true }
        serverless.service.mcp = {
          servers: {
            crm: { server: 'src/crm.mjs' },
            docs: { server: 'src/docs.mjs' },
          },
        }
        const plugin = makePlugin(serverless, { function: 'crm' })
        await plugin.hooks.initialize()
        await plugin.hooks['before:deploy:function:packageFunction']()
        const { functions } = serverless.service
        expect(functions.crm.package.patterns).toEqual(['serverless-mcp/**'])
        expect(functions.docs.package).toBeUndefined()
      })

      it('keeps the pattern at service level in shared mode', async () => {
        const serverless = makeServerless()
        serverless.service.mcp = oneServer
        const plugin = makePlugin(serverless)
        await plugin.hooks.initialize()
        await plugin.hooks['before:package:createDeploymentArtifacts']()
        expect(serverless.service.package.patterns).toEqual([
          'serverless-mcp/**',
        ])
        expect(serverless.service.functions.crm.package).toBeUndefined()
      })
    })
  })

  describe('config read path', () => {
    const mcpConfig = { servers: { docs: { server: 'src/docs.mjs' } } }

    const makeRealServerless = () => {
      const serverless = new Serverless({
        commands: [],
        options: {},
        servicePath: process.cwd(),
        serviceConfigFileName: 'serverless.yml',
        service: {
          service: 'acme',
          provider: { name: 'aws' },
          mcp: mcpConfig,
        },
      })
      serverless.credentialProviders = { aws: { getCredentials: jest.fn() } }
      const options = { stage: 'dev', region: 'us-east-1' }
      serverless.setProvider('aws', new AwsProvider(serverless, options))
      serverless.service.loadServiceFileParam()
      return serverless
    }

    it('does not copy custom top-level properties onto the service model', () => {
      // `lib/classes/service.js` copies only a fixed set of known keys, so
      // `mcp` stays on `configurationInput`.
      const serverless = makeRealServerless()
      expect(serverless.service.mcp).toBeUndefined()
      expect(serverless.configurationInput.mcp).toEqual(mcpConfig)
    })

    it('resolves the mcp block from a real Serverless instance', () => {
      const serverless = makeRealServerless()
      const plugin = new AwsMcp(serverless, { stage: 'dev' })
      expect(plugin.getMcpConfig()).toEqual(mcpConfig)
    })

    it('prefers an mcp block already present on the service model', () => {
      const serverless = makeRealServerless()
      const fromService = { servers: { other: { server: 'src/other.mjs' } } }
      serverless.service.mcp = fromService
      const plugin = new AwsMcp(serverless, { stage: 'dev' })
      expect(plugin.getMcpConfig()).toEqual(fromService)
    })
  })
})
