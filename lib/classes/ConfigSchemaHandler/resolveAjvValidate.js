'use strict';

const Ajv = require('ajv').default;
const objectHash = require('object-hash');
const path = require('path');
const os = require('os');
const standaloneCode = require('ajv/dist/standalone').default;
const fs = require('fs');
const requireFromString = require('require-from-string');
const deepSortObjectByKey = require('../../utils/deepSortObjectByKey');
const ensureExists = require('../../utils/ensureExists');

const cacheDir = path.resolve(
  os.homedir(),
  `.serverless/artifacts/ajv-validate-${require('ajv/package').version}`
);

const getValidate = async (schema) => {
  const schemaHash = objectHash(deepSortObjectByKey(schema));
  const cachePath = path.resolve(cacheDir, schemaHash);

  const generate = async () => {
    const ajv = new Ajv({
      allErrors: true,
      coerceTypes: 'array',
      verbose: true,
      strict: false,
      code: { source: true },
    });
    require('ajv-keywords')(ajv, 'regexp');
    require('ajv-formats').default(ajv);
    const validate = ajv.compile(schema);
    const moduleCode = standaloneCode(ajv, validate);
    await fs.promises.writeFile(cachePath, moduleCode);
  };
  await ensureExists(cachePath, generate);
  const loadedModuleCode = await fs.promises.readFile(cachePath, 'utf-8');
  return requireFromString(loadedModuleCode, path.resolve(__dirname, 'resolveAjvValidate.js'));
};

module.exports = getValidate;
