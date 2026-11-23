/**
 * Schema of `provider.apiGateway.authorizers` and of `type: jwt` on http events,
 * validated against the real schema with `configValidationMode: error`.
 */

import { jest } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'

// The real `ConfigSchemaHandler` caches its compiled validator on disk, by
// default under `~/.serverless/artifacts`; point it at a throwaway directory.
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
  await import('../../../../../../../../../lib/serverless.js')
const { default: AwsProvider } =
  await import('../../../../../../../../../lib/plugins/aws/provider.js')
const { default: AwsCompileApigEvents } =
  await import('../../../../../../../../../lib/plugins/aws/package/compile/events/api-gateway/index.js')

// The configuration last validated: validation coerces values in place.
let lastConfigurationInput

/** Validates a service with the given authorizers and event authorizer; returns the error, or null. */
const validate = async ({ authorizers, eventAuthorizer = 'orders' }) => {
  const configurationInput = {
    service: 'acme',
    configValidationMode: 'error',
    provider: {
      name: 'aws',
      region: 'us-east-1',
      runtime: 'nodejs24.x',
      apiGateway: { authorizers },
    },
    functions: {
      list: {
        handler: 'handler.list',
        events: [
          {
            http: {
              path: 'orders',
              method: 'get',
              authorizer: eventAuthorizer,
            },
          },
        ],
      },
    },
  }
  lastConfigurationInput = configurationInput
  const serverless = new Serverless({
    commands: ['package'],
    options: {},
    servicePath: process.cwd(),
    serviceConfigFileName: 'serverless.yml',
    service: configurationInput,
  })
  serverless.credentialProviders = { aws: { getCredentials: jest.fn() } }
  serverless.service.loadServiceFileParam()
  const options = { stage: 'dev', region: 'us-east-1' }
  serverless.setProvider('aws', new AwsProvider(serverless, options))
  new AwsCompileApigEvents(serverless, options)
  try {
    await serverless.configSchemaHandler.validateConfig(configurationInput)
    return null
  } catch (error) {
    return error
  }
}

const single = {
  type: 'jwt',
  algorithms: ['RS256', 'es256'],
  issuerUrl: 'https://idp.example.com/',
  audience: 'api://orders',
}

describe('provider.apiGateway.authorizers schema', () => {
  jest.setTimeout(60_000)

  test('accepts the single-issuer form with every optional key', async () => {
    expect(
      await validate({
        authorizers: {
          orders: {
            ...single,
            type: 'JWT',
            name: 'orders-api',
            identitySource: 'method.request.header.X-Token',
            audience: ['a', { Ref: 'Client' }],
            additionalClaims: {
              tenant: 'acme',
              department: true,
              tier: { value: 'gold', required: false },
            },
          },
        },
        eventAuthorizer: { name: 'orders', type: 'jwt', scopes: ['read'] },
      }),
    ).toBeNull()
    // Validation must not coerce a `true` claim rule into the string "true".
    expect(
      lastConfigurationInput.provider.apiGateway.authorizers.orders
        .additionalClaims,
    ).toEqual({
      tenant: 'acme',
      department: true,
      tier: { value: 'gold', required: false },
    })
  })

  test('accepts the multi-issuer form and intrinsics', async () => {
    expect(
      await validate({
        authorizers: {
          orders: {
            type: 'jwt',
            algorithms: ['RS256'],
            identitySource: { 'Fn::Sub': 'method.request.header.${Name}' },
            issuers: [
              {
                issuerUrl: { 'Fn::GetAtt': ['UserPool', 'ProviderURL'] },
                audience: { Ref: 'Client' },
              },
              {
                issuerUrl: 'https://b.example.com',
                audience: 'b',
                additionalClaims: { tenant: 'acme' },
              },
            ],
          },
        },
      }),
    ).toBeNull()
  })

  test('accepts type: jwt with an authorizerId on an http event', async () => {
    expect(
      await validate({
        authorizers: { orders: single },
        eventAuthorizer: {
          type: 'jwt',
          authorizerId: { 'Fn::ImportValue': 'orders-authorizer' },
          scopes: ['read'],
        },
      }),
    ).toBeNull()
  })

  test.each([
    ['no algorithms', { ...single, algorithms: undefined }],
    ['an empty algorithms list', { ...single, algorithms: [] }],
    ['an unknown algorithm', { ...single, algorithms: ['HS256'] }],
    ['a type other than jwt', { ...single, type: 'token' }],
    ['both issuers and issuerUrl', { ...single, issuers: [single] }],
    ['a reserved claim', { ...single, additionalClaims: { scp: 'x' } }],
    ['a false claim rule', { ...single, additionalClaims: { tenant: false } }],
    [
      'a query string identity source',
      { ...single, identitySource: 'method.request.querystring.token' },
    ],
    ['an unknown key', { ...single, resultTtlInSeconds: 0 }],
  ])('rejects %s', async (_, definition) => {
    const error = await validate({ authorizers: { orders: definition } })
    expect(error).toMatchObject({
      code: 'INVALID_NON_SCHEMA_COMPLIANT_CONFIGURATION',
    })
  })
})
