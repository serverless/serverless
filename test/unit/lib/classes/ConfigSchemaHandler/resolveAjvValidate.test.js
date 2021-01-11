'use strict';

const chai = require('chai');
const resolveAjvValidate = require('../../../../../lib/classes/ConfigSchemaHandler/resolveAjvValidate');
const objectHash = require('object-hash');
const deepSortObjectByKey = require('../../../../../lib/utils/deepSortObjectByKey');
const path = require('path');
const os = require('os');
const fs = require('fs');

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

    const fileStat = await fs.promises.lstat(
      path.resolve(
        os.homedir(),
        `.serverless/artifacts/ajv-validate-${require('ajv/package').version}`,
        schemaHash
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

    const fileStat = await fs.promises.lstat(
      path.resolve(
        os.homedir(),
        `.serverless/artifacts/ajv-validate-${require('ajv/package').version}`,
        schemaHash
      )
    );
    expect(fileStat.isFile()).to.be.true;
  });
});
