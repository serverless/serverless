import { jest } from '@jest/globals'

// Dev Mode's shim reaches the local machine over AWS IoT, so every function's
// role needs `iot:*` for the session. These tests run Dev Mode's update() on a
// real Serverless + AwsProvider, then the real IAM merge and per-function role
// creation, and read the role each Lambda actually assumes. A function with
// its own role (functions.<name>.iam.role.*) does not inherit the shared
// role's statements in the default mode, so a grant on the shared role alone
// leaves it timing out under `serverless dev`.
const logger = {
  debug: jest.fn(),
  info: jest.fn(),
  notice: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  aside: jest.fn(),
  blankLine: jest.fn(),
  logoDevMode: jest.fn(),
}

jest.unstable_mockModule('@serverless/util', () => ({
  getOrCreateGlobalDeploymentBucket: jest.fn(),
  log: {
    ...logger,
    get: jest.fn(() => logger),
  },
  progress: { get: jest.fn(() => ({ notice: jest.fn(), remove: jest.fn() })) },
  style: { aside: jest.fn((m) => m), link: jest.fn((url) => url) },
  writeText: jest.fn(),
  ServerlessError: class ServerlessError extends Error {},
  ServerlessErrorCodes: { INVALID_CONFIG: 'INVALID_CONFIG' },
  addProxyToAwsClient: jest.fn((client) => client),
  stringToSafeColor: jest.fn((str) => str),
  getPluginWriters: jest.fn(() => ({})),
  getPluginConstructors: jest.fn(() => ({})),
  write: jest.fn(),
}))
jest.unstable_mockModule('aws-iot-device-sdk', () => ({ default: {} }))
jest.unstable_mockModule('chokidar', () => ({
  default: { watch: jest.fn(() => ({ on: jest.fn() })) },
}))

const { default: AwsProvider } =
  await import('../../../../../../lib/plugins/aws/provider.js')
const { default: Serverless } =
  await import('../../../../../../lib/serverless.js')
const { default: AwsDev } =
  await import('../../../../../../lib/plugins/aws/dev/index.js')
const { default: mergeIamTemplatesMixin } =
  await import('../../../../../../lib/plugins/aws/package/lib/merge-iam-templates.js')
const { default: rolesPerFunctionMixin } =
  await import('../../../../../../lib/plugins/aws/package/lib/roles-per-function.js')

const IOT = { Effect: 'Allow', Action: ['iot:*'], Resource: '*' }

function buildService({ functions, iamRole, plugins }) {
  const serverless = new Serverless({ commands: [], options: {} })
  serverless.cli = { log: jest.fn() }
  serverless.credentialProviders = { aws: { getCredentials: jest.fn() } }
  serverless.processedInput = { commands: ['dev'], options: {} }
  serverless.configurationInput = {}
  serverless.service.service = 'orders'
  serverless.service.serviceObject = { name: 'orders' }
  serverless.service.provider.name = 'aws'
  serverless.service.provider.runtime = 'nodejs24.x'
  serverless.service.provider.compiledCloudFormationTemplate = {
    Resources: {},
    Outputs: {},
  }
  if (iamRole) serverless.service.provider.iam = { role: iamRole }
  serverless.setProvider(
    'aws',
    new AwsProvider(serverless, { region: 'us-east-1' }),
  )
  serverless.service.functions = functions
  if (plugins) serverless.pluginManager.getPlugins = () => plugins

  const provider = serverless.getProvider('aws')
  provider.request = jest.fn(async () => ({ endpointAddress: 'iot.example' }))
  const resources =
    serverless.service.provider.compiledCloudFormationTemplate.Resources
  for (const name of Object.keys(functions)) {
    resources[provider.naming.getLambdaLogicalId(name)] = {
      Type: 'AWS::Lambda::Function',
      Properties: {
        FunctionName: name,
        Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
      },
    }
  }
  const ctx = {
    serverless,
    provider,
    ...mergeIamTemplatesMixin,
    ...rolesPerFunctionMixin,
  }
  return { serverless, provider, ctx, resources }
}

// The statements of the role a function's Lambda resource points at.
function roleStatementsFor({ provider, resources }, functionName) {
  const role =
    resources[provider.naming.getLambdaLogicalId(functionName)].Properties.Role
  const roleLogicalId = role['Fn::GetAtt'][0]
  return resources[roleLogicalId].Properties.Policies.flatMap(
    (policy) => policy.PolicyDocument.Statement,
  )
}

async function packageForDev(built) {
  const dev = new AwsDev(built.serverless, {})
  await dev.update()
  built.ctx.mergeIamTemplates()
  built.ctx.createRolesPerFunction()
  return dev
}

const tableStatement = {
  Effect: 'Allow',
  Action: ['dynamodb:PutItem'],
  Resource: 'arn:aws:dynamodb:us-east-1:123456789012:table/orders',
}

describe('dev mode: every function role can reach the relay', () => {
  it('a function with its own iam.role.statements gets iot:* on its dedicated role', async () => {
    const built = buildService({
      functions: {
        createOrder: {
          handler: 'src/create.handler',
          iam: { role: { statements: [{ ...tableStatement }] } },
        },
        health: { handler: 'src/health.handler' },
      },
    })
    await packageForDev(built)

    const own = roleStatementsFor(built, 'createOrder')
    expect(own).toContainEqual(IOT)
    expect(own).toContainEqual(tableStatement)
    // The shared role keeps its grant for functions without a role of their own.
    expect(roleStatementsFor(built, 'health')).toContainEqual(IOT)
  })

  it('a role with only managed policies gets iot:* too', async () => {
    const built = buildService({
      functions: {
        reader: {
          handler: 'src/read.handler',
          iam: {
            role: {
              managedPolicies: [
                'arn:aws:iam::aws:policy/AmazonDynamoDBReadOnlyAccess',
              ],
            },
          },
        },
      },
    })
    await packageForDev(built)

    expect(roleStatementsFor(built, 'reader')).toContainEqual(IOT)
  })

  it('legacy iamRoleStatements on a function get exactly one iot:* grant', async () => {
    const built = buildService({
      functions: {
        writer: {
          handler: 'src/write.handler',
          iamRoleStatements: [{ ...tableStatement }],
        },
      },
    })
    await packageForDev(built)

    const statements = roleStatementsFor(built, 'writer')
    expect(statements.filter((s) => s.Action?.[0] === 'iot:*')).toHaveLength(1)
  })

  it('per-function mode: a function that opts out of inherited statements still gets iot:*', async () => {
    const built = buildService({
      iamRole: { mode: 'perFunction' },
      functions: {
        isolated: {
          handler: 'src/isolated.handler',
          iam: { inheritStatements: false },
        },
      },
    })
    await packageForDev(built)

    expect(roleStatementsFor(built, 'isolated')).toContainEqual(IOT)
  })

  it('restore() puts each function IAM config back the way it was', async () => {
    const built = buildService({
      functions: {
        createOrder: {
          handler: 'src/create.handler',
          iam: { role: { statements: [{ ...tableStatement }] } },
        },
        reader: {
          handler: 'src/read.handler',
          iam: { role: { managedPolicies: ['arn:aws:iam::aws:policy/X'] } },
        },
        health: { handler: 'src/health.handler' },
      },
    })
    const dev = new AwsDev(built.serverless, {})
    await dev.update()
    await dev.restore()

    const { functions } = built.serverless.service
    expect(functions.createOrder.iam.role.statements).toEqual([tableStatement])
    expect(functions.reader.iam.role.statements).toBeUndefined()
    expect('iam' in functions.health).toBe(false)
    expect('iamRoleStatements' in functions.health).toBe(false)
  })

  it('with the external per-function plugin, the grant goes onto iamRoleStatements as before', async () => {
    class ServerlessIamPerFunctionPlugin {}
    const built = buildService({
      plugins: [new ServerlessIamPerFunctionPlugin()],
      functions: {
        writer: {
          handler: 'src/write.handler',
          iamRoleStatements: [{ ...tableStatement }],
        },
      },
    })
    const dev = new AwsDev(built.serverless, {})
    await dev.update()

    const { writer } = built.serverless.service.functions
    expect(writer.iamRoleStatements).toContainEqual(IOT)
    expect(writer.iam).toBeUndefined()
  })
})
