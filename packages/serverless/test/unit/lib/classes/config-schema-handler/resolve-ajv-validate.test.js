import { describe, beforeAll, afterAll, it, expect } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fullFormats } from 'ajv-formats/dist/formats.js'

/**
 * Tests for the standalone validator that `ConfigSchemaHandler` generates from
 * the config schema and caches on disk.
 *
 * These run against the real dependency tree on purpose. npm can install a
 * separate copy of ajv for `ajv-formats`; code generated with that second copy
 * is serialized as data rather than code in the standalone validator, so every
 * `format` check throws (`formats0 is not a function`) instead of validating.
 * Whether that happens depends on how npm lays out `node_modules`, which is why
 * mocking ajv here would hide exactly the failure these tests exist to catch.
 */

// The handler caches generated validators under
// `$SLS_SCHEMA_CACHE_BASE_DIR/.serverless/artifacts/<dated dir>/`. Point it at a
// throwaway directory, derived from `os.tmpdir()` because this repo's jest does
// not propagate a `TMPDIR` override to the suites.
let schemaCacheDir
let previousSchemaCacheBaseDir
let getValidate
let getSchemaHash
let Serverless

beforeAll(async () => {
  schemaCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-ajv-validate-'))
  previousSchemaCacheBaseDir = process.env.SLS_SCHEMA_CACHE_BASE_DIR
  process.env.SLS_SCHEMA_CACHE_BASE_DIR = schemaCacheDir
  ;({ default: getValidate, getSchemaHash } =
    await import('../../../../../lib/classes/config-schema-handler/resolve-ajv-validate.js'))
  ;({ default: Serverless } = await import('../../../../../lib/serverless.js'))
})

afterAll(() => {
  if (previousSchemaCacheBaseDir === undefined) {
    delete process.env.SLS_SCHEMA_CACHE_BASE_DIR
  } else {
    process.env.SLS_SCHEMA_CACHE_BASE_DIR = previousSchemaCacheBaseDir
  }
  fs.rmSync(schemaCacheDir, { recursive: true, force: true })
})

const artifactsDir = () => path.join(schemaCacheDir, '.serverless', 'artifacts')

const cachedValidatorDir = () => {
  const [dir] = fs.readdirSync(artifactsDir())
  return path.join(artifactsDir(), dir)
}

const readCachedValidatorFor = (schema) => {
  const hash = getSchemaHash(schema)
  return fs.readFileSync(path.join(cachedValidatorDir(), `${hash}.js`), 'utf8')
}

describe('resolve-ajv-validate', () => {
  describe('cache key', () => {
    const nameSchema = (pattern) => ({
      type: 'object',
      properties: { name: { type: 'string', pattern } },
      additionalProperties: false,
    })

    it('reuses the validator for the same schema with keys in another order', async () => {
      const validate = await getValidate(nameSchema('^cache-key-a$'))

      expect(
        await getValidate({
          additionalProperties: false,
          properties: { name: { pattern: '^cache-key-a$', type: 'string' } },
          type: 'object',
        }),
      ).toBe(validate)
    })

    it('compiles a separate validator for a schema differing deep inside', async () => {
      const validateA = await getValidate(nameSchema('^cache-key-b$'))
      const validateB = await getValidate(nameSchema('^cache-key-c$'))

      expect(validateB).not.toBe(validateA)
      expect(validateA({ name: 'cache-key-b' })).toBe(true)
      expect(validateB({ name: 'cache-key-b' })).toBe(false)
      expect(validateB({ name: 'cache-key-c' })).toBe(true)
    })

    it("does not depend on the locale's collation", () => {
      const schema = {
        properties: { b: {}, a: {}, Z: {}, aa: {}, ä: {} },
      }
      const hash = getSchemaHash(schema)

      const { localeCompare } = String.prototype
      // Collate in reverse, as no real locale does, to make any reliance on
      // `localeCompare` visible.
      String.prototype.localeCompare = function (other) {
        return -localeCompare.call(this, other)
      }
      try {
        expect(getSchemaHash(schema)).toBe(hash)
      } finally {
        String.prototype.localeCompare = localeCompare
      }
    })
  })

  describe('format keywords', () => {
    const uriSchema = {
      type: 'object',
      properties: { origin: { type: 'string', format: 'uri' } },
    }

    it('accepts a value matching `format: uri`', async () => {
      const validate = await getValidate(uriSchema)

      expect(validate({ origin: 's3://bucket.s3.amazonaws.com/files' })).toBe(
        true,
      )
    })

    it('reports a value not matching `format: uri` as a validation error', async () => {
      const validate = await getValidate(uriSchema)

      expect(validate({ origin: 'not a uri' })).toBe(false)
      expect(validate.errors).toEqual([
        expect.objectContaining({
          keyword: 'format',
          instancePath: '/origin',
          params: { format: 'uri' },
        }),
      ])
    })

    it('generates a working check for every ajv-formats format', async () => {
      const names = Object.keys(fullFormats)
      const validate = await getValidate({
        type: 'object',
        properties: Object.fromEntries(
          names.map((name) => [name, { type: 'string', format: name }]),
        ),
      })

      // Some formats accept any string ('password', 'binary') and the numeric
      // ones skip strings, so not every check reports - but none may throw,
      // and whatever is reported must be a format error.
      const value = Object.fromEntries(names.map((name) => [name, '~~']))
      expect(() => validate(value)).not.toThrow()
      expect(validate.errors).not.toHaveLength(0)
      for (const error of validate.errors) {
        expect(error.keyword).toBe('format')
      }
    })

    it('references formats through a require() call in the generated code', async () => {
      await getValidate(uriSchema)

      const code = readCachedValidatorFor(uriSchema)
      expect(code).toContain(
        'require("ajv-formats/dist/formats").fullFormats.uri',
      )
      // An ajv code object from a second ajv copy serializes to JSON with an
      // `_items` key.
      expect(code).not.toContain('"_items"')
    })
  })

  describe('full config schema', () => {
    /**
     * Validates a service configuration against the complete schema that the
     * CLI builds, with every bundled plugin loaded. Returns `null` when the
     * configuration is schema-compliant, otherwise the validation message.
     */
    const validateServiceConfig = async (configuration) => {
      const serviceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-svc-'))
      try {
        const serverless = new Serverless({
          commands: ['package'],
          options: {},
          servicePath: serviceDir,
          serviceConfigFileName: 'serverless.yml',
          service: {
            service: 'format-validation',
            configValidationMode: 'error',
            ...configuration,
            provider: {
              name: 'aws',
              region: 'us-east-1',
              ...configuration.provider,
            },
          },
          credentialProviders: { aws: { getCredentials: async () => ({}) } },
        })
        await serverless.init()
        await serverless.configSchemaHandler.validateConfig(
          serverless.configurationInput,
        )
        return null
      } catch (error) {
        return error.message
      } finally {
        fs.rmSync(serviceDir, { recursive: true, force: true })
      }
    }

    // The first validation generates the standalone validator for the whole
    // schema - megabytes of code, which takes seconds while the rest of the
    // suite runs in parallel. Generate it once here, with room for that; the
    // tests below reuse it from memory.
    beforeAll(async () => {
      expect(await validateServiceConfig({})).toBeNull()
    }, 60000)

    const cloudFrontOrigin = (origin) => ({
      functions: {
        router: {
          handler: 'handler.handler',
          events: [{ cloudFront: { eventType: 'origin-request', origin } }],
        },
      },
    })

    const albOidcAuthorizer = (issuer) => ({
      provider: {
        alb: {
          authorizers: {
            idp: {
              type: 'oidc',
              authorizationEndpoint: 'https://idp.example.com/authorize',
              clientId: 'client',
              clientSecret: 'secret',
              issuer,
              tokenEndpoint: 'https://idp.example.com/token',
              userInfoEndpoint: 'https://idp.example.com/userinfo',
            },
          },
        },
      },
    })

    const s3ExpirationDate = (ExpirationDate) => ({
      provider: {
        s3: {
          assets: {
            lifecycleConfiguration: {
              Rules: [{ Status: 'Enabled', ExpirationDate }],
            },
          },
        },
      },
    })

    it('accepts a URL string as cloudFront `origin`', async () => {
      expect(
        await validateServiceConfig(
          cloudFrontOrigin('s3://bucket.s3.amazonaws.com/files'),
        ),
      ).toBeNull()
    })

    it('rejects a non-URL string as cloudFront `origin`', async () => {
      expect(
        await validateServiceConfig(cloudFrontOrigin('not a uri')),
      ).toMatch(/functions\.router\.events\.0\.cloudFront\.origin/)
    })

    it('accepts URLs in an ALB OIDC authorizer', async () => {
      expect(
        await validateServiceConfig(
          albOidcAuthorizer('https://idp.example.com'),
        ),
      ).toBeNull()
    })

    it('rejects a non-URL ALB OIDC authorizer issuer', async () => {
      expect(
        await validateServiceConfig(albOidcAuthorizer('not a uri')),
      ).toMatch(/provider\.alb\.authorizers\.idp/)
    })

    it('accepts an ISO date-time as S3 lifecycle `ExpirationDate`', async () => {
      expect(
        await validateServiceConfig(
          s3ExpirationDate('2030-01-01T00:00:00.000Z'),
        ),
      ).toBeNull()
    })

    it('rejects a non-date S3 lifecycle `ExpirationDate`', async () => {
      expect(
        await validateServiceConfig(s3ExpirationDate('next year')),
      ).toMatch(/provider\.s3\.assets\.lifecycleConfiguration/)
    })

    it('reports a non-URL cloudFront `origin` as a warning in `warn` mode', async () => {
      expect(
        await validateServiceConfig({
          ...cloudFrontOrigin('not a uri'),
          configValidationMode: 'warn',
        }),
      ).toBeNull()
    })
  })
})
