import { jest } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'

// This suite drives the REAL `ConfigSchemaHandler`, which compiles the root
// schema into a standalone ajv validator cached on disk, by default under the
// developer's `~/.serverless/artifacts`. Point that at a throwaway directory
// via the handler's own escape hatch (read per call inside `getCacheDir`, so
// setting it in `beforeAll` is early enough). Derived from `os.tmpdir()`
// explicitly: this repo's jest does not propagate a `TMPDIR` override.
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

const { default: Serverless } =
  await import('../../../../../../../lib/serverless.js')
const { default: AwsProvider } =
  await import('../../../../../../../lib/plugins/aws/provider.js')
const { defineWebAppsSchema, webAppConfigSchema } =
  await import('../../../../../../../lib/plugins/aws/web-apps/validators/schema.js')
const { default: Ajv } = await import('ajv')
const { default: regexpKeyword } =
  await import('../../../../../../../lib/classes/config-schema-handler/regexp-keyword.js')

/**
 * Validate a service configuration with the given `webApps` block (and
 * optional extra top-level/provider keys) against the real schema. Returns the
 * validation message, or `null` when the configuration is compliant.
 *
 * `configValidationMode: 'error'` makes the handler throw instead of warning,
 * and the configuration is loaded before `AwsProvider` is constructed because
 * `defineProvider` returns early unless `provider.name === 'aws'`.
 */
const validate = async (webApps, { provider = {}, functions } = {}) => {
  const configurationInput = {
    service: 'shop',
    configValidationMode: 'error',
    provider: { name: 'aws', region: 'us-east-1', ...provider },
    webApps,
  }
  if (functions) configurationInput.functions = functions

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
  defineWebAppsSchema(serverless)

  try {
    await serverless.configSchemaHandler.validateConfig(configurationInput)
  } catch (error) {
    return error.message
  }
  return null
}

describe('webApps schema', () => {
  jest.setTimeout(60_000)

  it('accepts a minimal web app', async () => {
    expect(await validate({ api: { entry: 'src/server.ts' } })).toBeNull()
  })

  it('accepts every documented key', async () => {
    expect(
      await validate({
        api: {
          entry: 'src/server.ts',
          runtime: 'nodejs24.x',
          name: 'custom-name',
          description: 'Storefront',
          timeout: 30,
          maxConcurrency: 64,
          environment: { TABLE: 'orders' },
          logs: { applicationLogLevel: 'debug', systemLogLevel: 'WARN' },
          logRetentionInDays: 14,
          role: 'arn:aws:iam::123456789012:role/web',
          vpc: { subnetIds: ['subnet-1'], securityGroupIds: ['sg-1'] },
          kmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/abc',
          tags: { team: 'web' },
          package: { patterns: ['!test/**'], artifact: 'dist/app.zip' },
          build: false,
          url: { authorizer: 'AWS_IAM', maxEnvironments: 2, rateLimit: 2000 },
        },
      }),
    ).toBeNull()
  })

  it.each(['my app', 'shop.dev', 'x'.repeat(65)])(
    'rejects a name Lambda does not accept (%s)',
    async (name) => {
      expect(await validate({ api: { entry: 'src/server.ts', name } })).toMatch(
        /'webApps\.api\.name'/,
      )
    },
  )

  it('accepts a 64-character name of letters, digits, hyphens and underscores', async () => {
    expect(
      await validate({
        api: { entry: 'src/server.ts', name: `Shop_dev-${'a'.repeat(55)}` },
      }),
    ).toBeNull()
  })

  it('requires entry', async () => {
    expect(await validate({ api: { timeout: 30 } })).toMatch(
      /webApps\.api.*entry/,
    )
  })

  it('accepts url: true', async () => {
    expect(
      await validate({ api: { entry: 'src/server.ts', url: true } }),
    ).toBeNull()
  })

  it('rejects url: false at webApps.api.url', async () => {
    expect(
      await validate({ api: { entry: 'src/server.ts', url: false } }),
    ).toMatch(/'webApps\.api\.url'/)
  })

  it.each(['nodejs24.x', 'nodejs26.x', 'nodejs30.x', 'nodejs100.x'])(
    'accepts runtime %s',
    async (runtime) => {
      expect(
        await validate({ api: { entry: 'src/server.ts', runtime } }),
      ).toBeNull()
    },
  )

  it.each(['nodejs22.x', 'nodejs20.x', 'python3.13', 'node24', 'nodejs24'])(
    'rejects runtime %s at webApps.api.runtime',
    async (runtime) => {
      expect(
        await validate({ api: { entry: 'src/server.ts', runtime } }),
      ).toMatch(/'webApps\.api\.runtime'/)
    },
  )

  it('rejects timeout above 900 and below 3', async () => {
    expect(
      await validate({ api: { entry: 'src/server.ts', timeout: 901 } }),
    ).toMatch(/'webApps\.api\.timeout'/)
    expect(
      await validate({ api: { entry: 'src/server.ts', timeout: 2 } }),
    ).toMatch(/'webApps\.api\.timeout'/)
  })

  it('rejects maxConcurrency outside 1-128', async () => {
    expect(
      await validate({ api: { entry: 'src/server.ts', maxConcurrency: 129 } }),
    ).toMatch(/'webApps\.api\.maxConcurrency'/)
  })

  it('rejects rateLimit 150 with the accepted-values hint, accepts 2000 and 0', async () => {
    const message = await validate({
      api: { entry: 'src/server.ts', url: { rateLimit: 150 } },
    })
    expect(message).toMatch(
      /'webApps\.api\.url\.rateLimit': must be equal to one of the allowed values\. /,
    )
    expect(message).toContain(
      'Lambda accepts 0, 100 to 1000 in steps of 100, and 2000 to 10000 in steps of 1000; supported values can vary by Region, see https://docs.aws.amazon.com/lambda/latest/dg/web-functions-scaling.html',
    )
    expect(
      await validate({
        api: { entry: 'src/server.ts', url: { rateLimit: 2000 } },
      }),
    ).toBeNull()
    expect(
      await validate({
        api: { entry: 'src/server.ts', url: { rateLimit: 0 } },
      }),
    ).toBeNull()
  })

  it('rejects maxEnvironments below 2', async () => {
    expect(
      await validate({
        api: { entry: 'src/server.ts', url: { maxEnvironments: 1 } },
      }),
    ).toMatch(
      /'webApps\.api\.url\.maxEnvironments': must be an integer of at least 2/,
    )
  })

  it('accepts CloudFormation intrinsics for url.maxEnvironments and url.rateLimit', async () => {
    expect(
      await validate({
        api: {
          entry: 'src/server.ts',
          url: {
            maxEnvironments: { Ref: 'MaxEnvironments' },
            rateLimit: { 'Fn::If': ['IsProd', 2000, 100] },
          },
        },
      }),
    ).toBeNull()
  })

  it('rejects a key ending in "-"', async () => {
    expect(await validate({ 'api-': { entry: 'src/server.ts' } })).toMatch(
      /api-/,
    )
  })

  it('accepts keys with dashes and underscores inside', async () => {
    expect(
      await validate({ 'my-api_v2': { entry: 'src/server.ts' } }),
    ).toBeNull()
  })

  it('accepts logDataProtectionPolicy and checks it as for functions', async () => {
    const policy = {
      Name: 'mask-emails',
      Version: '2021-06-01',
      Statement: [],
    }
    expect(
      await validate({
        api: { entry: 'src/server.ts', logDataProtectionPolicy: policy },
      }),
    ).toBeNull()
    expect(
      await validate({
        api: {
          entry: 'src/server.ts',
          logDataProtectionPolicy: { Name: 'mask-emails' },
        },
      }),
    ).toMatch(/webApps\.api\.logDataProtectionPolicy/)
  })

  it('rejects logs.logFormat', async () => {
    expect(
      await validate({
        api: { entry: 'src/server.ts', logs: { logFormat: 'JSON' } },
      }),
    ).toMatch(/unrecognized property 'logFormat'/)
  })

  it('rejects an unknown web app key', async () => {
    expect(
      await validate({ api: { entry: 'src/server.ts', memorySize: 1024 } }),
    ).toMatch(/unrecognized property 'memorySize'/)
  })

  it('rejects unknown package keys', async () => {
    expect(
      await validate({
        api: { entry: 'src/server.ts', package: { individually: true } },
      }),
    ).toMatch(/unrecognized property 'individually'/)
  })

  it('accepts an intrinsic environment value', async () => {
    expect(
      await validate({
        api: { entry: 'src/server.ts', environment: { A: { Ref: 'P' } } },
      }),
    ).toBeNull()
  })

  it('accepts intrinsic tag values', async () => {
    expect(
      await validate({
        api: {
          entry: 'src/server.ts',
          tags: {
            Owner: { Ref: 'P' },
            Env: { 'Fn::If': ['IsProd', 'prod', 'dev'] },
          },
        },
      }),
    ).toBeNull()
  })

  it('rejects a tag value longer than 256 characters and an aws: key', async () => {
    expect(
      await validate({
        api: { entry: 'src/server.ts', tags: { Owner: 'x'.repeat(257) } },
      }),
    ).toMatch(/'webApps\.api\.tags/)
    expect(
      await validate({
        api: { entry: 'src/server.ts', tags: { 'aws:owner': 'me' } },
      }),
    ).toMatch(/'webApps\.api\.tags/)
  })

  it('accepts an intrinsic role', async () => {
    expect(
      await validate({ api: { entry: 'src/server.ts', role: { Ref: 'R' } } }),
    ).toBeNull()
    expect(
      await validate({
        api: {
          entry: 'src/server.ts',
          role: { 'Fn::If': ['UseCustom', 'arn:aws:iam::1:role/a', 'b'] },
        },
      }),
    ).toBeNull()
  })

  it('accepts the per-web-app IAM keys', async () => {
    expect(
      await validate({
        api: {
          entry: 'src/server.ts',
          iam: {
            inheritStatements: false,
            role: {
              name: 'shop-dev-api-role',
              statements: [
                {
                  Effect: 'Allow',
                  Action: ['dynamodb:GetItem'],
                  Resource: { 'Fn::GetAtt': ['OrdersTable', 'Arn'] },
                },
              ],
              managedPolicies: ['arn:aws:iam::aws:policy/ReadOnlyAccess'],
              permissionsBoundary: 'arn:aws:iam::123456789012:policy/boundary',
              path: '/web/',
              tags: { team: 'web' },
            },
          },
        },
      }),
    ).toBeNull()
  })

  // The role code passes both to CloudFormation as they are
  describe.each([
    [
      'a web app',
      (iam) => [{ api: { entry: 'src/server.ts', iam } }, {}],
      'webApps.api',
    ],
    [
      'a function',
      (iam) => [
        { api: { entry: 'src/server.ts' } },
        { functions: { hello: { handler: 'handler.hello', iam } } },
      ],
      'functions.hello',
    ],
  ])('iam.role on %s', (_title, given, path) => {
    it.each([
      ['Fn::Sub', { 'Fn::Sub': '${AWS::StackName}-api' }],
      ['Ref', { Ref: 'RoleName' }],
      ['Fn::Join', { 'Fn::Join': ['-', [{ Ref: 'AWS::StackName' }, 'api']] }],
      ['Fn::If', { 'Fn::If': ['UseCustom', 'custom-role', 'default-role'] }],
    ])('accepts a %s role name and tag value', async (_name, intrinsic) => {
      expect(
        await validate(
          ...given({
            role: { name: intrinsic, tags: { stack: intrinsic, team: 'web' } },
          }),
        ),
      ).toBeNull()
    })

    it('accepts an empty tag value', async () => {
      expect(
        await validate(...given({ role: { tags: { team: '' } } })),
      ).toBeNull()
    })

    it('rejects a role name that is neither a string nor an intrinsic', async () => {
      expect(
        await validate(...given({ role: { name: ['api', 'role'] } })),
      ).toMatch(new RegExp(`'${path.replace('.', '\\.')}\\.iam\\.role\\.name'`))
    })
  })

  it('rejects an unknown key under iam.role', async () => {
    expect(
      await validate({
        api: { entry: 'src/server.ts', iam: { role: { mode: 'shared' } } },
      }),
    ).toMatch(/'webApps\.api\.iam\.role'/)
  })

  it.each([
    ['iamRoleStatements', []],
    ['iamRoleStatementsInherit', true],
    ['iamRoleStatementsName', 'role'],
    ['iamPermissionsBoundary', 'arn:aws:iam::123456789012:policy/boundary'],
  ])('rejects the older function key %s', async (key, value) => {
    expect(
      await validate({ api: { entry: 'src/server.ts', [key]: value } }),
    ).toMatch(new RegExp(`unrecognized property '${key}'`))
  })

  it('accepts a provider.domains entry with webApp', async () => {
    expect(
      await validate(
        { api: { entry: 'src/server.ts' } },
        {
          provider: { domains: [{ name: 'shop.example.com', webApp: 'api' }] },
        },
      ),
    ).toBeNull()
  })

  it('rejects a non-string webApp on a domain entry', async () => {
    expect(
      await validate(
        { api: { entry: 'src/server.ts' } },
        {
          provider: {
            domains: [{ name: 'shop.example.com', webApp: { name: 'api' } }],
          },
        },
      ),
    ).toMatch(/provider\.domains/)
  })

  it('appends the webApps hint to entry on a functions entry', async () => {
    expect(
      await validate(
        { api: { entry: 'src/server.ts' } },
        { functions: { hello: { entry: 'src/server.ts' } } },
      ),
    ).toContain(
      "Configuration error at 'functions.hello': unrecognized property 'entry'. To run an HTTP server, define it under webApps.",
    )
  })
})

// The case-insensitive enums use the `regexp` keyword, which the real
// handler's compiled validator does not apply today (`resolve-ajv-validate.js`
// registers the keyword module's namespace instead of its default export), so
// these sub-schemas are compiled here with the keyword registered correctly.
describe('webApps case-insensitive enums', () => {
  const compile = (schema) => {
    const ajv = new Ajv({ allErrors: true, strict: false })
    ajv.addKeyword(regexpKeyword)
    return ajv.compile(schema)
  }

  it('accepts aws_iam in any case and rejects other authorizers', () => {
    const validateUrl = compile(webAppConfigSchema.properties.url)
    expect(validateUrl({ authorizer: 'aws_iam' })).toBe(true)
    expect(validateUrl({ authorizer: 'AWS_IAM' })).toBe(true)
    expect(validateUrl({ authorizer: 'none' })).toBe(false)
  })

  it('accepts the log levels in any case and rejects unknown ones', () => {
    const validateLogs = compile(webAppConfigSchema.properties.logs)
    expect(validateLogs({ applicationLogLevel: 'trace' })).toBe(true)
    expect(validateLogs({ applicationLogLevel: 'FATAL' })).toBe(true)
    expect(validateLogs({ systemLogLevel: 'warn' })).toBe(true)
    expect(validateLogs({ systemLogLevel: 'TRACE' })).toBe(false)
    expect(validateLogs({ applicationLogLevel: 'VERBOSE' })).toBe(false)
  })
})
