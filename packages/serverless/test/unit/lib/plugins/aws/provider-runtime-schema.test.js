/**
 * `provider.runtime` and `functions.<fn>.runtime` take a Lambda runtime identifier, a
 * customer-managed runtime alias ARN, or a CloudFormation intrinsic that returns one;
 * layer `compatibleRuntimes` also takes `custom`. Validated against the real schema.
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
const warningsFor = async ({
  providerKeys = {},
  functionKeys = {},
  layers,
} = {}) => {
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
    ...(layers && { layers }),
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

const aliasArn =
  'arn:aws:lambda:us-east-1:123456789012:runtime/companyphp8/alias/prod'

describe('customer-managed runtimes in the serverless.yml schema', () => {
  jest.setTimeout(60_000)

  test('runtime accepts a runtime alias ARN at function and provider level', async () => {
    expect(await warningsFor({ functionKeys: { runtime: aliasArn } })).toEqual(
      [],
    )
    expect(await warningsFor({ providerKeys: { runtime: aliasArn } })).toEqual(
      [],
    )
  })

  test('runtime accepts a CloudFormation intrinsic', async () => {
    for (const runtime of [
      { Ref: 'RuntimeStable' },
      { 'Fn::ImportValue': 'platform-runtime-alias-arn' },
      { 'Fn::GetAtt': ['RuntimeStable', 'Arn'] },
      { 'Fn::If': ['UseShared', aliasArn, { Ref: 'RuntimeStable' }] },
    ]) {
      expect(await warningsFor({ functionKeys: { runtime } })).toEqual([])
    }
  })

  test('runtime still accepts Lambda-managed identifiers', async () => {
    expect(
      await warningsFor({ functionKeys: { runtime: 'python3.14' } }),
    ).toEqual([])
  })

  test('other values get a warning that names all three forms', async () => {
    for (const runtime of [
      'nodejs24',
      `${aliasArn}/extra`,
      { arn: aliasArn, alias: 'prod' },
    ]) {
      const warnings = await warningsFor({ functionKeys: { runtime } })
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain(
        "at 'functions.hello.runtime': must be a Lambda runtime identifier",
      )
      expect(warnings[0]).toContain('nodejs24.x')
      expect(warnings[0]).toContain(
        'arn:aws:lambda:<region>:<account-id>:runtime/<runtime-name>/alias/<alias-name>',
      )
      expect(warnings[0]).toContain('CloudFormation intrinsic')
    }
  })

  test('layer compatibleRuntimes accepts custom but not an ARN', async () => {
    const layer = (compatibleRuntimes) => ({
      shared: { path: 'layer', compatibleRuntimes },
    })
    expect(
      await warningsFor({ layers: layer(['custom', 'nodejs24.x']) }),
    ).toEqual([])
    const warnings = await warningsFor({ layers: layer([aliasArn]) })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("at 'layers.shared.compatibleRuntimes.0'")
  })
})
