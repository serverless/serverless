import { jest } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'

// This suite drives the REAL `ConfigSchemaHandler`, which compiles the root
// schema into a standalone ajv validator and caches it on disk - by default
// under the developer's `~/.serverless/artifacts`, keyed by date, so every
// machine pays the compile once a day and leaves an artifact behind. Point that
// at a throwaway directory instead, via the handler's own escape hatch
// (`resolve-ajv-validate.js` reads the variable inside `getCacheDir`, per call,
// so setting it in `beforeAll` is early enough).
//
// The path is derived explicitly from `os.tmpdir()`: this repo's jest does not
// propagate a `TMPDIR` override to the suites, so relying on one would silently
// write to the real temp root.
let schemaCacheDir
let previousSchemaCacheBaseDir

beforeAll(() => {
  schemaCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-schema-cache-'))
  previousSchemaCacheBaseDir = process.env.SLS_SCHEMA_CACHE_BASE_DIR
  process.env.SLS_SCHEMA_CACHE_BASE_DIR = schemaCacheDir
})

afterAll(() => {
  if (previousSchemaCacheBaseDir === undefined) {
    delete process.env.SLS_SCHEMA_CACHE_BASE_DIR
  } else {
    process.env.SLS_SCHEMA_CACHE_BASE_DIR = previousSchemaCacheBaseDir
  }
  fs.rmSync(schemaCacheDir, { recursive: true, force: true })
})

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
  ServerlessErrorCodes: {},
  getOrCreateGlobalDeploymentBucket: jest.fn(),
  addProxyToAwsClient: jest.fn((client) => client),
  stringToSafeColor: jest.fn((str) => str),
  getPluginWriters: jest.fn(() => ({})),
  getPluginConstructors: jest.fn(() => ({})),
  write: jest.fn(),
}))

const { default: AwsMcp } =
  await import('../../../../../../lib/plugins/aws/mcp/index.js')
const { default: mcpSchema } =
  await import('../../../../../../lib/plugins/aws/mcp/lib/schema.js')
const { default: Serverless } =
  await import('../../../../../../lib/serverless.js')
const { default: AwsProvider } =
  await import('../../../../../../lib/plugins/aws/provider.js')

/**
 * Validate a service configuration carrying the given `mcp` block against the
 * REAL config schema, through the real `ConfigSchemaHandler`.
 *
 * Returns `null` when the configuration is schema-compliant, otherwise the
 * aggregated validation message.
 *
 * Two ordering constraints matter here:
 *  - `configValidationMode: 'error'` makes the handler throw instead of
 *    warning, which is what lets a test assert on validation outcomes.
 *  - the service configuration must be loaded BEFORE `AwsProvider` is
 *    constructed: `defineProvider` (which registers `#/definitions/awsArn`,
 *    referenced by `mcp.servers[].state`) returns early unless
 *    `service.provider.name === 'aws'`.
 */
const validateMcp = async (mcp) => {
  const configurationInput = {
    service: 'acme',
    configValidationMode: 'error',
    provider: { name: 'aws', region: 'us-east-1' },
  }
  if (mcp !== undefined) configurationInput.mcp = mcp

  const serverless = new Serverless({
    commands: [],
    options: {},
    servicePath: process.cwd(),
    serviceConfigFileName: 'serverless.yml',
    service: configurationInput,
  })
  serverless.credentialProviders = { aws: { getCredentials: jest.fn() } }
  serverless.service.loadServiceFileParam()
  serverless.setProvider(
    'aws',
    new AwsProvider(serverless, { stage: 'dev', region: 'us-east-1' }),
  )
  new AwsMcp(serverless, { stage: 'dev' })

  try {
    await serverless.configSchemaHandler.validateConfig(configurationInput)
  } catch (error) {
    return error.message
  }
  return null
}

const fullyValidMcp = {
  servers: {
    docs: { server: 'src/docs.mjs' },
    'support-bot_2': {
      server: 'src/support.mjs',
      authorizer: 'myAuthorizer',
      oauthDiscovery: {
        issuer: 'https://example.auth0.com/',
        publicUrl: 'https://mcp.example.com',
      },
      timeout: 300,
      memorySize: 1024,
      environment: { TABLE_NAME: 'orders' },
      state: true,
    },
  },
}

const withServerConfig = (config) => ({
  servers: { docs: { server: 'src/docs.mjs', ...config } },
})

describe('mcp schema (real config-schema-handler)', () => {
  it('accepts a fully populated mcp block', async () => {
    expect(await validateMcp(fullyValidMcp)).toBeNull()
  })

  it('accepts a service without an mcp block at all', async () => {
    expect(await validateMcp(undefined)).toBeNull()
  })

  it('rejects a server entry without `server`', async () => {
    expect(await validateMcp({ servers: { docs: {} } })).toContain(
      `at 'mcp.servers.docs': must have required property 'server'`,
    )
  })

  it('rejects an mcp block without `servers`', async () => {
    expect(await validateMcp({})).toContain(
      `at 'mcp': must have required property 'servers'`,
    )
  })

  // An `mcp` block declaring no servers at all is a configuration mistake, not
  // an opt-out - `minProperties` is what turns it into an error rather than a
  // silently inert block.
  it('rejects an empty `servers` map', async () => {
    expect(await validateMcp({ servers: {} })).toContain(
      `at 'mcp.servers': must NOT have fewer than 1 properties`,
    )
  })

  it.each([
    ['a user authorizer function name', 'myAuthorizer'],
    ['the `aws_iam` shorthand', 'aws_iam'],
  ])('accepts a string `authorizer` naming %s', async (_label, authorizer) => {
    expect(await validateMcp(withServerConfig({ authorizer }))).toBeNull()
  })

  it.each([
    ['a request-type authorizer function', { name: 'myAuthorizer' }],
    [
      'a fully specified request-type authorizer',
      {
        name: 'myAuthorizer',
        type: 'request',
        identitySource: 'method.request.header.Authorization',
        identityValidationExpression: '^Bearer .+$',
        resultTtlInSeconds: 300,
      },
    ],
    [
      'a Cognito user pool with scopes',
      {
        arn: 'arn:aws:cognito-idp:us-east-1:123456789012:userpool/us-east-1_ab1',
        scopes: ['profile', 'openid'],
      },
    ],
    [
      'a Cognito user pool declared in this same stack',
      {
        arn: { 'Fn::GetAtt': ['Pool', 'Arn'] },
        scopes: ['profile', { Ref: 'ExtraScope' }],
      },
    ],
    ['an existing authorizer id', { authorizerId: 'abc123' }],
    ['an authorizer id from an intrinsic', { authorizerId: { Ref: 'MyAuth' } }],
    [
      'a Cognito authorizer managed outside this service',
      { name: 'shared', claims: ['email'], managedExternally: true },
    ],
  ])('accepts an object `authorizer` for %s', async (_label, authorizer) => {
    expect(await validateMcp(withServerConfig({ authorizer }))).toBeNull()
  })

  // The string branch carries `minLength`, so an empty string cannot slip
  // through as "no authorizer" - `authorizer` is simply omitted for that.
  it('rejects an empty string `authorizer`', async () => {
    const message = await validateMcp(withServerConfig({ authorizer: '' }))
    expect(message).toContain(
      `at 'mcp.servers.docs.authorizer': must NOT have fewer than 1 characters`,
    )
  })

  // `awsArn` widens `arn` to intrinsics, but its string form still has to look
  // like an ARN.
  it('rejects a non-ARN string `authorizer.arn`', async () => {
    const message = await validateMcp(
      withServerConfig({ authorizer: { arn: 'not-an-arn' } }),
    )
    expect(message).toContain(
      `at 'mcp.servers.docs.authorizer.arn': unsupported string format`,
    )
  })

  it('rejects an unknown key inside an object `authorizer`', async () => {
    const message = await validateMcp(
      withServerConfig({ authorizer: { name: 'myAuthorizer', issuer: 'x' } }),
    )
    expect(message).toContain(
      `at 'mcp.servers.docs.authorizer': unrecognized property 'issuer'`,
    )
  })

  it('rejects an out-of-range `authorizer.resultTtlInSeconds`', async () => {
    const message = await validateMcp(
      withServerConfig({ authorizer: { name: 'a', resultTtlInSeconds: 3601 } }),
    )
    expect(message).toContain(
      `at 'mcp.servers.docs.authorizer.resultTtlInSeconds': must be <= 3600`,
    )
  })

  it.each([
    ['without `publicUrl`', { issuer: 'https://example.auth0.com/' }],
    [
      'with `publicUrl`',
      {
        issuer: 'https://example.auth0.com/',
        publicUrl: 'https://mcp.example.com',
      },
    ],
  ])('accepts `oauthDiscovery` %s', async (_label, oauthDiscovery) => {
    expect(await validateMcp(withServerConfig({ oauthDiscovery }))).toBeNull()
  })

  // A same-stack authorization server - a Cognito pool created in this
  // service's own `resources:` - has no literal URL at package time, so the
  // issuer accepts the intrinsics that name one.
  it.each([
    [
      'an Fn::Sub',
      {
        'Fn::Sub':
          'https://cognito-idp.${AWS::Region}.amazonaws.com/${UserPool}',
      },
    ],
    ['a Ref', { Ref: 'IssuerParameter' }],
    ['an Fn::GetAtt', { 'Fn::GetAtt': ['UserPool', 'ProviderURL'] }],
    ['an Fn::ImportValue', { 'Fn::ImportValue': 'shared-issuer' }],
  ])(
    'accepts an `oauthDiscovery.issuer` that is %s',
    async (_label, issuer) => {
      expect(
        await validateMcp(withServerConfig({ oauthDiscovery: { issuer } })),
      ).toBeNull()
    },
  )

  // `publicUrl` is the external front door and is printed in the endpoint
  // summary, so it stays literal even though the issuer beside it does not.
  it('rejects an intrinsic `oauthDiscovery.publicUrl`', async () => {
    const message = await validateMcp(
      withServerConfig({
        oauthDiscovery: {
          issuer: 'https://example.auth0.com/',
          publicUrl: { Ref: 'DomainName' },
        },
      }),
    )
    expect(message).toContain(`at 'mcp.servers.docs.oauthDiscovery.publicUrl'`)
  })

  it('rejects `oauthDiscovery` without `issuer`', async () => {
    const message = await validateMcp(
      withServerConfig({
        oauthDiscovery: { publicUrl: 'https://mcp.example.com' },
      }),
    )
    expect(message).toContain(
      `at 'mcp.servers.docs.oauthDiscovery': must have required property 'issuer'`,
    )
  })

  it('rejects a non-https `oauthDiscovery.publicUrl`', async () => {
    const message = await validateMcp(
      withServerConfig({
        oauthDiscovery: {
          issuer: 'https://example.auth0.com/',
          publicUrl: 'http://example.auth0.com/',
        },
      }),
    )
    expect(message).toContain(
      `at 'mcp.servers.docs.oauthDiscovery.publicUrl': must match pattern "^https://"`,
    )
  })

  // The issuer accepts an intrinsic beside the literal, so a non-https literal
  // fails the whole `anyOf` rather than one pattern - which the handler
  // reports the way it reports every other union, as an unsupported format
  // (the same message a bad `authorizer.arn` gets). `validate.js` is what
  // spells out the fix.
  it('rejects a non-https `oauthDiscovery.issuer`', async () => {
    const message = await validateMcp(
      withServerConfig({
        oauthDiscovery: { issuer: 'http://example.auth0.com/' },
      }),
    )
    expect(message).toContain(`at 'mcp.servers.docs.oauthDiscovery.issuer':`)
  })

  it('rejects an unknown key inside `oauthDiscovery`', async () => {
    const message = await validateMcp(
      withServerConfig({
        oauthDiscovery: {
          issuer: 'https://example.auth0.com/',
          audiences: ['https://mcp.example.com'],
        },
      }),
    )
    expect(message).toContain(
      `at 'mcp.servers.docs.oauthDiscovery': unrecognized property 'audiences'`,
    )
  })

  // The hosted `auth` block is gone, not renamed: a service still carrying one
  // has to be told, rather than have it silently ignored.
  it('rejects the former `auth` block', async () => {
    const message = await validateMcp(
      withServerConfig({
        auth: {
          issuer: 'https://example.auth0.com/',
          audiences: ['https://mcp.example.com'],
        },
      }),
    )
    expect(message).toContain(
      `at 'mcp.servers.docs': unrecognized property 'auth'`,
    )
  })

  it.each([
    ['below the minimum', 0, `at 'mcp.servers.docs.timeout': must be >= 1`],
    ['above the maximum', 901, `at 'mcp.servers.docs.timeout': must be <= 900`],
  ])('rejects a timeout %s', async (_label, timeout, expected) => {
    const message = await validateMcp({
      servers: { docs: { server: 'src/docs.mjs', timeout } },
    })
    expect(message).toContain(expected)
  })

  it('accepts the maximum timeout of 900', async () => {
    expect(
      await validateMcp({
        servers: { docs: { server: 'src/docs.mjs', timeout: 900 } },
      }),
    ).toBeNull()
  })

  it('rejects an unknown key in a server entry', async () => {
    const message = await validateMcp({
      servers: { docs: { server: 'src/docs.mjs', nope: true } },
    })
    expect(message).toContain(
      `at 'mcp.servers.docs': unrecognized property 'nope'`,
    )
  })

  it('rejects an unknown key at the mcp root', async () => {
    const message = await validateMcp({
      servers: { docs: { server: 'src/docs.mjs' } },
      nope: true,
    })
    expect(message).toContain(`at 'mcp': unrecognized property 'nope'`)
  })

  it('rejects an invalid server name', async () => {
    const message = await validateMcp({
      servers: { 'my server!': { server: 'src/docs.mjs' } },
    })
    expect(message).toContain(
      `at 'mcp.servers': must match pattern "^[a-zA-Z0-9-_]+$"`,
    )
    expect(message).toContain(`at 'mcp.servers': property name must be valid`)
  })

  it('accepts `state: true`', async () => {
    expect(
      await validateMcp({
        servers: { docs: { server: 'src/docs.mjs', state: true } },
      }),
    ).toBeNull()
  })

  it('accepts an ARN for `state`', async () => {
    expect(
      await validateMcp({
        servers: {
          docs: {
            server: 'src/docs.mjs',
            state: 'arn:aws:ssm:us-east-1:123456789012:parameter/x',
          },
        },
      }),
    ).toBeNull()
  })

  it('rejects a numeric `state`', async () => {
    const message = await validateMcp({
      servers: { docs: { server: 'src/docs.mjs', state: 42 } },
    })
    expect(message).toContain(`at 'mcp.servers.docs.state'`)
  })

  // A CloudFormation intrinsic hides the ARN's service from the ARN-type check,
  // which is what picks between `ssm:GetParameter` and
  // `secretsmanager:GetSecretValue` - so v1 takes literal ARNs only.
  it('rejects a CloudFormation intrinsic for `state`', async () => {
    const message = await validateMcp({
      servers: {
        docs: {
          server: 'src/docs.mjs',
          state: { 'Fn::Sub': 'arn:aws:ssm:${AWS::Region}:1:parameter/x' },
        },
      },
    })
    expect(message).toContain(`at 'mcp.servers.docs.state'`)
  })

  it('rejects an invalid environment variable name', async () => {
    const message = await validateMcp({
      servers: {
        docs: { server: 'src/docs.mjs', environment: { 'BAD-KEY': 'x' } },
      },
    })
    expect(message).toContain(`at 'mcp.servers.docs.environment'`)
  })

  it('accepts string and CloudFormation-intrinsic environment values', async () => {
    expect(
      await validateMcp({
        servers: {
          docs: {
            server: 'src/docs.mjs',
            environment: {
              TABLE_NAME: 'orders',
              _LEADING_UNDERSCORE: '',
              QUEUE_URL: { Ref: 'MyQueue' },
            },
          },
        },
      }),
    ).toBeNull()
  })
})

// `validateConfig` resolves `$ref`s by mutating the registered schema in place,
// so a schema object shared between two Serverless instances would be handed a
// half-normalized copy of itself. The factory has to hand out a fresh tree -
// nested objects included, since the mutation reaches all the way down.
describe('mcp schema factory', () => {
  it('returns a fresh root object on every call', () => {
    expect(mcpSchema()).not.toBe(mcpSchema())
  })

  it('returns fresh nested objects, not shared references', () => {
    const serverOf = (schema) => schema.properties.servers.additionalProperties
    const [a, b] = [mcpSchema(), mcpSchema()]
    expect(serverOf(a)).not.toBe(serverOf(b))
    expect(serverOf(a).properties.oauthDiscovery).not.toBe(
      serverOf(b).properties.oauthDiscovery,
    )
    expect(serverOf(a).properties.authorizer.anyOf).not.toBe(
      serverOf(b).properties.authorizer.anyOf,
    )
    expect(serverOf(a).properties.state.anyOf).not.toBe(
      serverOf(b).properties.state.anyOf,
    )
    // Still the same shape - the guard is about identity, not content.
    expect(mcpSchema()).toEqual(mcpSchema())
  })
})
