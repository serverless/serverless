import Ajv, { _ } from 'ajv'
import { fullFormats } from 'ajv-formats/dist/formats.js'
import crypto from 'crypto'
import path from 'path'
import os from 'os'
import { default as standaloneCode } from 'ajv/dist/standalone/index.js'
import { log } from '@serverless/util'
import fsp from 'fs/promises'
import { fileURLToPath } from 'url'
import safeMoveFile from '../../utils/fs/safe-move-file.js'
import requireFromString from 'require-from-string'
import ensureExists from '../../utils/ensure-exists.js'
import ServerlessError from '../../serverless-error.js'

// NOTE: Unlike other files that redirect __dirname from dist/ to lib/... when bundled,
// this file keeps __dirname as-is. When bundled, __dirname = dist/, which makes
// requireFromString (called below with a virtual path under __dirname) resolve
// `require("ajv/dist/runtime/...")` from dist/node_modules/, where
// prepareDistributionTarballs.js ships the ajv runtime files.
let __dirname = path.dirname(fileURLToPath(import.meta.url))

const getCacheDir = async () => {
  // Come up with a unique string for the current day-month-year
  // to avoid potential conflicts with other versions of AJV
  // that may be cached in the same directory.
  const date = new Date()
  const day = date.getDate().toString().padStart(2, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const year = date.getFullYear().toString()
  const uniqueString = `${day}-${month}-${year}`

  return path.resolve(
    process.env.SLS_SCHEMA_CACHE_BASE_DIR || os.homedir(),
    `.serverless/artifacts/ajv-validate-${uniqueString}`,
  )
}

const isFile = async (filePath) => {
  try {
    return (await fsp.stat(filePath)).isFile()
  } catch {
    return false
  }
}

// Validators are cached by schema hash for the purpose
// of speeding up tests and reducing their memory footprint.
const cachedValidatorsBySchemaHash = {}

// The cache key is a hash of the schema's JSON with object keys sorted. A JSON
// Schema is JSON, and ajv itself embeds it into the standalone validator with
// `JSON.stringify`. Keys are sorted by code unit, not `localeCompare`, so the
// key (and the cache file name) does not depend on the machine's locale.
// Hashing one string is cheap next to walking the object, which matters: the
// schema arrives here with every `$ref` inlined (hundreds of KB), on every
// command.
const sortKeys = (key, value) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((k) => [k, value[k]]),
      )
    : value

export const getSchemaHash = (schema) =>
  crypto
    .createHash('sha256')
    .update(JSON.stringify(schema, sortKeys))
    .digest('hex')

const getValidate = async (schema) => {
  const schemaHash = getSchemaHash(schema)
  if (cachedValidatorsBySchemaHash[schemaHash]) {
    return cachedValidatorsBySchemaHash[schemaHash]
  }
  const filename = `${schemaHash}.js`
  const cachePath = path.resolve(await getCacheDir(), filename)

  const generate = async () => {
    const ajv = new Ajv({
      allErrors: true,
      coerceTypes: 'array',
      verbose: true,
      strict: false,
      strictRequired: false,
      code: {
        source: true,
        // Formats are registered directly rather than through the ajv-formats
        // plugin: the plugin generates code with its own copy of ajv, which
        // npm may install separately from this one, and code from a second
        // ajv copy is serialized as data instead of code in the standalone
        // validator.
        formats: _`require("ajv-formats/dist/formats").fullFormats`,
      },
    })
    for (const [name, format] of Object.entries(fullFormats)) {
      ajv.addFormat(name, format)
    }

    const regexpKeyword = await import('./regexp-keyword.js')
    ajv.addKeyword(regexpKeyword)

    let validate
    try {
      validate = ajv.compile(schema)
    } catch (err) {
      console.log(err)
      if (err.message && err.message.includes('strict mode')) {
        throw new ServerlessError(
          'At least one of the plugins defines a validation schema that is invalid. Try disabling plugins one by one to identify the problematic plugin and report it to the plugin maintainers.',
          'SCHEMA_FAILS_STRICT_MODE',
        )
      }
      throw err
    }
    const moduleCode = standaloneCode(ajv, validate)

    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sls-ajv'))
    try {
      const tmpCachePath = path.resolve(tmpDir, filename)
      await fsp.writeFile(tmpCachePath, moduleCode)
      try {
        await safeMoveFile(tmpCachePath, cachePath)
      } catch (err) {
        // Parallel runs (concurrent deploys, Compose services) can cache the
        // same validator first. The file name is the schema hash, so its
        // content is identical; on Windows the move onto it can fail with EPERM.
        if (!(await isFile(cachePath))) throw err
      }
    } finally {
      // A leftover temporary directory is harmless; never fail the run over it.
      await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  await ensureExists(cachePath, generate)
  const loadedModuleCode = await fsp.readFile(cachePath, 'utf-8')
  const validator = requireFromString(
    loadedModuleCode,
    path.resolve(__dirname, `[generated-ajv-validate]${filename}`),
  )

  if (typeof validator !== 'function') {
    log.error(
      'Unexpected validator %o, resolved from source %s',
      validator,
      loadedModuleCode,
    )
    throw new Error(
      'Unexpected non-function AJV validator type. Please report at https://github.com/serverless/serverless including all the logs output',
    )
  }

  cachedValidatorsBySchemaHash[schemaHash] = validator
  return validator
}

export default getValidate
