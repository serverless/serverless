// packages/sf-core/scripts/verify-config-validator-packaging.js
/**
 * Proves the released CLI can run the config validator it generates. The
 * validator is standalone code written to `~/.serverless/artifacts` and loaded
 * from `<package>/dist`, where its `require()` calls must resolve against the
 * ajv runtime files that prepareDistributionTarballs.js ships into
 * `dist/node_modules`. A schema change that makes ajv emit a new runtime
 * require, or a packaging change that drops one of those files, breaks
 * validation only in the release — every source run and unit test still
 * passes.
 *
 * The validator is generated from the complete config schema (every bundled
 * plugin loaded), the same one the CLI builds, and then loaded from a copy of
 * the extracted package outside the repository, so nothing can resolve through
 * the repository's `node_modules`. Run AFTER the packed tarball is extracted
 * (see test:build).
 * Usage: node verify-config-validator-packaging.js <path-to-extracted-package-dir>
 */
import { cp, mkdtemp, readdir, readFile, realpath, rm } from 'fs/promises'
import { createRequire } from 'module'
import { tmpdir } from 'os'
import path from 'path'

const packageDir = process.argv[2]
if (!packageDir) {
  console.error(
    'Usage: node verify-config-validator-packaging.js <extracted package dir>',
  )
  process.exit(1)
}

// realpath: module resolution returns real paths (macOS tmpdir is a symlink),
// and they are compared against this directory below.
const workDir = await realpath(
  await mkdtemp(path.join(tmpdir(), 'config-validator-verify-')),
)
try {
  // Where a user's machine has the release: no node_modules above it.
  const installedPackageDir = path.join(workDir, 'package')
  await cp(path.resolve(packageDir), installedPackageDir, { recursive: true })

  // The handler reads this per call, so it must be set before validating.
  const cacheBaseDir = path.join(workDir, 'cache')
  process.env.SLS_SCHEMA_CACHE_BASE_DIR = cacheBaseDir

  const { default: Serverless } =
    await import('../../serverless/lib/serverless.js')

  // One configuration reaching every `format` check in the built-in schema.
  const configuration = {
    service: 'config-validator-verify',
    configValidationMode: 'error',
    provider: {
      name: 'aws',
      region: 'us-east-1',
      alb: {
        authorizers: {
          idp: {
            type: 'oidc',
            authorizationEndpoint: 'https://idp.example.com/authorize',
            clientId: 'client',
            clientSecret: 'secret',
            issuer: 'https://idp.example.com',
            tokenEndpoint: 'https://idp.example.com/token',
            userInfoEndpoint: 'https://idp.example.com/userinfo',
          },
        },
      },
      s3: {
        assets: {
          lifecycleConfiguration: {
            Rules: [
              { Status: 'Enabled', ExpirationDate: '2030-01-01T00:00:00.000Z' },
            ],
          },
        },
      },
    },
    functions: {
      router: {
        handler: 'handler.handler',
        events: [
          {
            cloudFront: {
              eventType: 'origin-request',
              origin: 's3://bucket.s3.amazonaws.com/files',
            },
          },
        ],
      },
    },
  }

  const serverless = new Serverless({
    commands: ['package'],
    options: {},
    servicePath: workDir,
    serviceConfigFileName: 'serverless.yml',
    service: configuration,
    credentialProviders: { aws: { getCredentials: async () => ({}) } },
  })
  await serverless.init()

  const failures = []

  // Generates and caches the validator, and checks the configuration with it
  // in-process from the source tree.
  try {
    await serverless.configSchemaHandler.validateConfig(
      serverless.configurationInput,
    )
  } catch (error) {
    failures.push(`validating a valid configuration throws: ${error.message}`)
  }

  const artifactsDir = path.join(cacheBaseDir, '.serverless', 'artifacts')
  const [cacheDir] = await readdir(artifactsDir)
  const [validatorFile] = await readdir(path.join(artifactsDir, cacheDir))
  const code = await readFile(
    path.join(artifactsDir, cacheDir, validatorFile),
    'utf8',
  )

  // Code from a second ajv copy is serialized as data, with an `_items` key,
  // instead of being emitted as code.
  if (code.includes('"_items"')) {
    failures.push(
      'the generated validator contains serialized ajv code objects; code was generated with a second copy of ajv',
    )
  }

  // Resolve every require() the generated code makes from where the handler
  // loads it: a virtual module path inside `<package>/dist`.
  const validatorPath = path.join(
    installedPackageDir,
    'dist',
    `[generated-ajv-validate]${validatorFile}`,
  )
  const requireFromDist = createRequire(validatorPath)
  const specifiers = [
    ...new Set([...code.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1])),
  ]
  for (const specifier of specifiers) {
    try {
      const resolved = requireFromDist.resolve(specifier)
      if (!resolved.startsWith(installedPackageDir + path.sep)) {
        failures.push(
          `require("${specifier}") resolves outside the package: ${resolved}`,
        )
      }
    } catch {
      failures.push(
        `require("${specifier}") does not resolve from the package; ship it in prepareDistributionTarballs.js`,
      )
    }
  }

  if (!failures.length) {
    const requireFromServerless = createRequire(
      new URL('../../serverless/package.json', import.meta.url),
    )
    const requireFromString = requireFromServerless('require-from-string')
    const validate = requireFromString(code, validatorPath)

    if (!validate(configuration)) {
      failures.push(
        `the packaged validator rejects a valid configuration: ${JSON.stringify(validate.errors)}`,
      )
    }
    const invalid = structuredClone(configuration)
    invalid.functions.router.events[0].cloudFront.origin = 'not a uri'
    if (
      validate(invalid) ||
      !validate.errors.some((error) => error.keyword === 'format')
    ) {
      failures.push(
        'the packaged validator does not report a format error for an invalid cloudFront origin',
      )
    }
  }

  if (failures.length) {
    console.error(
      `Config validator packaging check failed:\n  - ${failures.join('\n  - ')}`,
    )
    process.exitCode = 1
  } else {
    console.log(
      `Config validator packaging check passed (${specifiers.length} runtime requires resolve from the package: ${specifiers.join(', ')})`,
    )
  }
} finally {
  await rm(workDir, { recursive: true, force: true })
}
