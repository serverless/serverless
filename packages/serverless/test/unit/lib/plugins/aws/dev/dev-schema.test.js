/**
 * `serverless dev` adds no keys to serverless.yml. A `dev` key on a function or at the top level is
 * validated like any other unknown property, against the real schema with the dev plugin loaded.
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

const { default: Serverless } =
  await import('../../../../../../lib/serverless.js')
const { default: AwsProvider } =
  await import('../../../../../../lib/plugins/aws/provider.js')
const { default: AwsDev } =
  await import('../../../../../../lib/plugins/aws/dev/index.js')
const { log } = await import('@serverless/util')

/**
 * Validates a service whose `hello` function and top level carry the given extra keys, with
 * `configValidationMode: 'error'` (the default `mode`) so a violation throws. Returns the error,
 * or null.
 */
const validate = async ({
  functionKeys = {},
  topLevelKeys = {},
  mode = 'error',
} = {}) => {
  const configurationInput = {
    service: 'acme',
    configValidationMode: mode,
    provider: { name: 'aws', region: 'us-east-1', runtime: 'nodejs24.x' },
    functions: { hello: { handler: 'handler.hello', ...functionKeys } },
    ...topLevelKeys,
  }
  const serverless = new Serverless({
    commands: ['dev'],
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
  new AwsDev(serverless, {})
  try {
    await serverless.configSchemaHandler.validateConfig(configurationInput)
    return null
  } catch (error) {
    return error
  }
}

describe('serverless.yml schema with the dev plugin loaded', () => {
  jest.setTimeout(60_000)

  test('a plain service is valid', async () => {
    expect(await validate()).toBeNull()
  })

  test('in warn mode a leftover dev key gets the same warning as any other unknown key', async () => {
    const warnings = []
    const spy = jest
      .spyOn(log, 'warning')
      .mockImplementation((text) => warnings.push(String(text)))
    try {
      expect(
        await validate({ functionKeys: { dev: false }, mode: 'warn' }),
      ).toBeNull()
      expect(
        await validate({ functionKeys: { bogus: false }, mode: 'warn' }),
      ).toBeNull()
    } finally {
      spy.mockRestore()
    }
    expect(warnings).toHaveLength(2)
    expect(warnings[0]).toContain(
      "at 'functions.hello': unrecognized property 'dev'",
    )
    expect(warnings[0].replace("'dev'", "'bogus'")).toBe(warnings[1])
  })

  test('functions.<fn>.dev is an unknown property, like any other', async () => {
    const devError = await validate({ functionKeys: { dev: false } })
    const otherError = await validate({ functionKeys: { bogus: false } })
    expect(devError).toMatchObject({
      code: 'INVALID_NON_SCHEMA_COMPLIANT_CONFIGURATION',
    })
    expect(devError.message).toContain(
      "at 'functions.hello': unrecognized property 'dev'",
    )
    expect(devError.message.replace("'dev'", "'bogus'")).toBe(
      otherError.message,
    )
  })

  test('a top-level dev key is an unknown property, like any other', async () => {
    const devError = await validate({
      topLevelKeys: { dev: { watch: { ignore: ['fixtures/**'] } } },
    })
    const otherError = await validate({
      topLevelKeys: { bogus: { watch: { ignore: ['fixtures/**'] } } },
    })
    expect(devError).toMatchObject({
      code: 'INVALID_NON_SCHEMA_COMPLIANT_CONFIGURATION',
    })
    expect(devError.message).toContain("at root: unrecognized property 'dev'")
    expect(devError.message.replace("'dev'", "'bogus'")).toBe(
      otherError.message,
    )
  })
})

describe('dev command options for web apps', () => {
  let commands
  beforeAll(async () => {
    ;({ default: commands } =
      await import('../../../../../../lib/cli/commands-schema.js'))
  })

  test('dev takes --web-app, --skip-web-app and --local-only, all repeatable', () => {
    const { options } = commands.get('dev')
    for (const name of ['web-app', 'skip-web-app', 'local-only']) {
      expect(options[name].type).toBe('multiple')
      expect(options[name].usage).toEqual(expect.any(String))
    }
  })

  test('dev wait takes --web-app and waits --for request', () => {
    const { options } = commands.get('dev wait')
    expect(options['web-app'].type).toBe('multiple')
    expect(options.for.usage).toContain('"request"')
  })

  test('dev requests takes --web-app', () => {
    expect(commands.get('dev requests').options['web-app'].type).toBe(
      'multiple',
    )
  })
})
