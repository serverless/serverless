'use strict';

const Ajv = require('ajv').default;
const objectHash = require('object-hash');
const path = require('path');
const os = require('os');
const standaloneCode = require('ajv/dist/standalone').default;
const fs = require('fs');
const requireFromString = require('require-from-string');
const deepSortObjectByKey = require('../../utils/deep-sort-object-by-key');
const ensureExists = require('../../utils/ensure-exists');
const ServerlessError = require('../../serverless-error');

const getCacheDir = () => {
  return path.resolve(
    process.env.SLS_SCHEMA_CACHE_BASE_DIR || os.homedir(),
    `.serverless/artifacts/ajv-validate-${require('ajv/package').version}`
  );
};

// Validators are cached by schema hash for the purpose
// of speeding up tests and reducing their memory footprint.
// If that solution proves to not be enough, we can improve it
// with `uni-global` package.
const cachedValidatorsBySchemaHash = {};

const getValidate = async (schema) => {
  const schemaHash = objectHash(deepSortObjectByKey(schema));
  if (cachedValidatorsBySchemaHash[schemaHash]) {
    return cachedValidatorsBySchemaHash[schemaHash];
  }
  const filename = `${schemaHash}.js`;
  const cachePath = path.resolve(getCacheDir(), filename);

  const generate = async () => {
    const ajv = new Ajv({
      allErrors: true,
      coerceTypes: 'array',
      verbose: true,
      strict: true,
      strictRequired: false,
      code: { source: true },
    });
    require('ajv-formats').default(ajv);
    // Ensure AJV related packages work well when there are mutliple AJV installations around
    // See: https://github.com/ajv-validator/ajv/issues/1390#issuecomment-763138202
    ajv.opts.code.formats = Ajv._`require("ajv-formats/dist/formats").fullFormats`;
    ajv.addKeyword(require('./regexp-keyword'));
    let validate;
    try {
      validate = ajv.compile(schema);
    } catch (err) {
      if (err.message && err.message.includes('strict mode')) {
        throw new ServerlessError(
          'At least one of the plugins defines a validation schema that is invalid. Try disabling plugins one by one to identify the problematic plugin and report it to the plugin maintainers.',
          'SCHEMA_FAILS_STRICT_MODE'
        );
      }
      throw err;
    }
    const moduleCode = standaloneCode(ajv, validate);
    await fs.promises.writeFile(cachePath, moduleCode);
  };
  await ensureExists(cachePath, generate);
  const loadedModuleCode = await fs.promises.readFile(cachePath, 'utf-8');
  const validator = requireFromString(
    loadedModuleCode,
    path.resolve(__dirname, `[generated-ajv-validate]${filename}`)
  );
  cachedValidatorsBySchemaHash[schemaHash] = validator;
  return validator;
};

module.exports = getValidate;
