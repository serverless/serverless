/**
 * `build: false` on a function is the documented way to keep esbuild's hands
 * off a single handler — the escape hatch the ESBUILD_HANDLER_NOT_BUILT error
 * points people at. An escape hatch the config schema rejects is not an escape
 * hatch, so this suite validates it against the REAL schema.
 *
 * The value must also reach the plugin UNMUTATED: `_shouldBuildFunction`
 * recognizes the opt-out with strict equality (`build === false`), while the
 * schema is compiled with ajv's `coerceTypes: 'array'`. A `type: 'string'`
 * branch ordered before the boolean one would silently rewrite `false` to the
 * string "false" during validation.
 */

import { jest } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'

// The real `ConfigSchemaHandler` compiles the root schema into a standalone
// ajv validator cached on disk, by default under the developer's
// `~/.serverless/artifacts`. Point that at a throwaway directory via the
// handler's own escape hatch (read per call inside `getCacheDir`, so setting
// it in `beforeAll` is early enough). Derived from `os.tmpdir()` explicitly:
// this repo's jest does not propagate a `TMPDIR` override to suites.
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

/**
 * Validate a service configuration whose single function carries the given
 * `build` value, against the real schema. Returns the validation message, or
 * `null` when compliant, plus the (possibly coerced) post-validation value.
 *
 * `configValidationMode: 'error'` makes the handler throw rather than warn,
 * and the service configuration is loaded before `AwsProvider` is constructed
 * because `defineProvider` returns early unless `provider.name === 'aws'`.
 */
const validateFunctionBuild = async (build) => {
  const functionConfig = { handler: 'src/handler.hello' }
  if (build !== undefined) functionConfig.build = build

  const configurationInput = {
    service: 'acme',
    configValidationMode: 'error',
    provider: { name: 'aws', region: 'us-east-1', runtime: 'nodejs20.x' },
    functions: { hello: functionConfig },
  }

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

  let message = null
  try {
    await serverless.configSchemaHandler.validateConfig(configurationInput)
  } catch (error) {
    message = error.message
  }
  return { message, value: configurationInput.functions.hello.build }
}

describe('function-level `build` schema', () => {
  jest.setTimeout(60_000)

  it('accepts `build: false` and leaves the boolean unmutated', async () => {
    const { message, value } = await validateFunctionBuild(false)
    expect(message).toBeNull()
    // Not the string "false": the plugin compares with strict equality.
    expect(value).toBe(false)
  })

  it("accepts `build: 'esbuild'`", async () => {
    expect((await validateFunctionBuild('esbuild')).message).toBeNull()
  })

  it('accepts a function with no `build` at all', async () => {
    expect((await validateFunctionBuild(undefined)).message).toBeNull()
  })
})
