import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import objectHash from 'object-hash'
import path from 'path'
import os from 'os'
import { default as standaloneCode } from 'ajv/dist/standalone/index.js'
import utils from '@serverlessinc/sf-core/src/utils.js'
import fsp from 'fs/promises'
import { fileURLToPath } from 'url'
import safeMoveFile from '../../utils/fs/safe-move-file.js'
import requireFromString from 'require-from-string'
import deepSortObjectByKey from '../../utils/deep-sort-object-by-key.js'
import ensureExists from '../../utils/ensure-exists.js'
import ServerlessError from '../../serverless-error.js'

let __dirname = path.dirname(fileURLToPath(import.meta.url))
if (__dirname.endsWith('dist')) {
  __dirname = path.join(__dirname, '../lib/classes/config-schema-handler')
}

const { log } = utils

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

// Validators are cached by schema hash for the purpose
// of speeding up tests and reducing their memory footprint.
const cachedValidatorsBySchemaHash = {}

const getValidate = async (schema) => {
  const schemaHash = objectHash(deepSortObjectByKey(schema))
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
      code: { source: true },
    })
    addFormats(ajv)

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

    const tmpDir = await fsp.mkdtemp('sls-ajv')

    const tmpCachePath = path.resolve(tmpDir, filename)
    await fsp.writeFile(tmpCachePath, moduleCode)
    await safeMoveFile(tmpCachePath, cachePath)
    await fsp.rmdir(tmpDir)
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
