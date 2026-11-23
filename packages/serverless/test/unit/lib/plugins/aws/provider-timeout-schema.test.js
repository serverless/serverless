/**
 * `provider.timeout` and `functions.<fn>.timeout` follow the Lambda function timeout limit,
 * 1 to 1800 seconds, validated against the real schema.
 */

import { jest } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'

// The real `ConfigSchemaHandler` caches its compiled validator on disk, by default under
// `~/.serverless/artifacts`; point it at a throwaway directory derived from `os.tmpdir()`.
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

const { default: Serverless } = await import('../../../../../lib/serverless.js')
const { default: AwsProvider } =
  await import('../../../../../lib/plugins/aws/provider.js')
const { log } = await import('@serverless/util')

/**
 * Validates a service with the given `provider` and `hello` function keys in warn mode, the
 * default, and returns the schema warnings it printed.
 */
const warningsFor = async ({ providerKeys = {}, functionKeys = {} } = {}) => {
  const configurationInput = {
    service: 'acme',
    configValidationMode: 'warn',
    provider: {
      name: 'aws',
      region: 'us-east-1',
      runtime: 'nodejs24.x',
      ...providerKeys,
    },
    functions: { hello: { handler: 'handler.hello', ...functionKeys } },
  }
  const serverless = new Serverless({
    commands: ['package'],
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
  const warnings = []
  const spy = jest
    .spyOn(log, 'warning')
    .mockImplementation((text) => warnings.push(String(text)))
  try {
    await serverless.configSchemaHandler.validateConfig(configurationInput)
  } finally {
    spy.mockRestore()
  }
  return warnings
}

describe('Lambda function timeout in the serverless.yml schema', () => {
  jest.setTimeout(60_000)

  test('functions.<fn>.timeout accepts 1 to 1800 seconds', async () => {
    expect(await warningsFor({ functionKeys: { timeout: 1 } })).toEqual([])
    expect(await warningsFor({ functionKeys: { timeout: 1800 } })).toEqual([])
  })

  test('provider.timeout accepts up to 1800 seconds', async () => {
    expect(await warningsFor({ providerKeys: { timeout: 1800 } })).toEqual([])
  })

  test('a timeout above 1800 seconds gets a schema warning', async () => {
    const functionWarnings = await warningsFor({
      functionKeys: { timeout: 1801 },
    })
    expect(functionWarnings).toHaveLength(1)
    expect(functionWarnings[0]).toContain(
      "at 'functions.hello.timeout': must be <= 1800",
    )

    const providerWarnings = await warningsFor({
      providerKeys: { timeout: 1801 },
    })
    expect(providerWarnings).toHaveLength(1)
    expect(providerWarnings[0]).toContain(
      "at 'provider.timeout': must be <= 1800",
    )
  })

  test('a timeout below 1 second gets a schema warning', async () => {
    const warnings = await warningsFor({ functionKeys: { timeout: 0 } })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("at 'functions.hello.timeout'")
  })
})
