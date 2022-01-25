'use strict';

const chai = require('chai');
const resolveAjvValidate = require('../../../../../lib/classes/config-schema-handler/resolve-ajv-validate');
const objectHash = require('object-hash');
const deepSortObjectByKey = require('../../../../../lib/utils/deep-sort-object-by-key');
const path = require('path');
const os = require('os');
const fsp = require('fs').promises;

chai.use(require('chai-as-promised'));

const expect = chai.expect;

describe('test/unit/lib/classes/ConfigSchemaHandler/resolveAjvValidate.test.js', () => {
  const schema = {
    $id: 'https://example.com/person.schema.json',
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'TestSchema',
    type: 'object',
    properties: {
      firstProp: {
        type: 'string',
      },
    },
  };

  it('generates schema validation file', async () => {
    await resolveAjvValidate(schema);
    const schemaHash = objectHash(deepSortObjectByKey(schema));

    const fileStat = await fsp.lstat(
      path.resolve(
        process.env.SLS_SCHEMA_CACHE_BASE_DIR || os.homedir(),
        `.serverless/artifacts/ajv-validate-${require('ajv/package').version}`,
        `${schemaHash}.js`
      )
    );
    expect(fileStat.isFile()).to.be.true;
  });

  it('regenerates schema validation file if schema changes', async () => {
    await resolveAjvValidate(schema);
    const updatedSchema = {
      ...schema,
      title: 'ChangedTitle',
    };
    await resolveAjvValidate(updatedSchema);
    const schemaHash = objectHash(deepSortObjectByKey(updatedSchema));

    const fileStat = await fsp.lstat(
      path.resolve(
        process.env.SLS_SCHEMA_CACHE_BASE_DIR || os.homedir(),
        `.serverless/artifacts/ajv-validate-${require('ajv/package').version}`,
        `${schemaHash}.js`
      )
    );
    expect(fileStat.isFile()).to.be.true;
  });
});
