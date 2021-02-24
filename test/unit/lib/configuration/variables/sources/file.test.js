'use strict';

const { expect } = require('chai');

const path = require('path');
const resolveMeta = require('../../../../../../lib/configuration/variables/resolve-meta');
const resolve = require('../../../../../../lib/configuration/variables/resolve');
const fileSource = require('../../../../../../lib/configuration/variables/sources/file');

describe('test/unit/lib/configuration/variables/sources/file.test.js', () => {
  const servicePath = path.resolve(__dirname, 'fixture');
  let configuration;
  let variablesMeta;
  before(async () => {
    configuration = {
      yaml: '${file(file.yaml)}',
      yml: '${file(file.yml)}',
      json: '${file(file.json)}',
      tfstate: '${file(file.tfstate)}',
      js: '${file(file.js)}',
      variablesResolutionMode: '20210219',
      jsFunction: '${file(file-function.js)}',
      jsPropertyFunction: '${file(file-property-function.js):property}',
      addressSupport: '${file(file.json):result}',
      nonExistingYaml: '${file(not-existing.yaml)}',
      nonExistingJs: '${file(not-existing.js)}',
      notFile: '${file(dir.yaml)}',
      noParams: '${file:}',
      noParams2: '${file():}',
      external: '${file(../file.test.js)}',
      invalidYaml: '${file(invalid.yml)}',
      invalidJson: '${file(invalid.json)}',
      invalidJs: '${file(invalid.js)}',
      invalidJs2: '${file(invalid2.js)}',
      invalidExt: '${file(invalid.ext)}',
    };
    variablesMeta = resolveMeta(configuration);
    await resolve({
      servicePath,
      configuration,
      variablesMeta,
      sources: { file: fileSource },
      options: {},
    });
  });

  it('should resolve "yaml" file sources', () =>
    expect(configuration.yaml).to.deep.equal({ result: 'yaml' }));

  it('should resolve "yml" file sources', () =>
    expect(configuration.yml).to.deep.equal({ result: 'yml' }));

  it('should resolve "json" file sources', () =>
    expect(configuration.json).to.deep.equal({ result: 'json' }));

  it('should resolve "tfstate" file sources', () =>
    expect(configuration.tfstate).to.deep.equal({ result: 'tfstate' }));

  it('should resolve "js" file sources', () =>
    expect(configuration.js).to.deep.equal({ result: 'js' }));

  it('should support function resolvers in "js" file sources', () =>
    expect(configuration.jsFunction).to.deep.equal({ result: 'js-function' }));

  it('should support function property resolvers in "js" file sources', () =>
    expect(configuration.jsPropertyFunction).to.deep.equal({ result: 'js-property-function' }));

  it('should support "address" argument', () =>
    expect(configuration.addressSupport).to.equal('json'));

  it('should report with an error non existing files', () =>
    expect(variablesMeta.get('nonExistingYaml').error.code).to.equal('VARIABLE_RESOLUTION_ERROR'));

  it('should report with an error non existing JS files', () =>
    expect(variablesMeta.get('nonExistingJs').error.code).to.equal('VARIABLE_RESOLUTION_ERROR'));

  it('should report with an error non file paths', () =>
    expect(variablesMeta.get('notFile').error.code).to.equal('VARIABLE_RESOLUTION_ERROR'));

  it('should report with an error missing path argument', () => {
    expect(variablesMeta.get('noParams').error.code).to.equal('VARIABLE_RESOLUTION_ERROR');
    expect(variablesMeta.get('noParams2').error.code).to.equal('VARIABLE_RESOLUTION_ERROR');
  });

  it('should report with an error attempt to access external path', () =>
    expect(variablesMeta.get('external').error.code).to.equal('VARIABLE_RESOLUTION_ERROR'));

  it('should report with an error an invalid YAML file', () =>
    expect(variablesMeta.get('invalidYaml').error.code).to.equal('VARIABLE_RESOLUTION_ERROR'));

  it('should report with an error an invalid JSON file', () =>
    expect(variablesMeta.get('invalidJson').error.code).to.equal('VARIABLE_RESOLUTION_ERROR'));

  it('should report with an error an invalid JS file', () => {
    expect(variablesMeta.get('invalidJs').error.code).to.equal('VARIABLE_RESOLUTION_ERROR');
    expect(variablesMeta.get('invalidJs2').error.code).to.equal('VARIABLE_RESOLUTION_ERROR');
  });

  it('should report with an error an unrecognized extension', () =>
    expect(variablesMeta.get('invalidExt').error.code).to.equal('VARIABLE_RESOLUTION_ERROR'));

  it('should not support function resolvers in "js" file sources not confirmed to work with new resolver', async () => {
    configuration = {
      jsFunction: '${file(file-function.js)}',
      jsPropertyFunction: '${file(file-property-function.js):property}',
    };
    variablesMeta = resolveMeta(configuration);
    await resolve({
      servicePath,
      configuration,
      variablesMeta,
      sources: { file: fileSource },
      options: {},
    });
    expect(variablesMeta.get('jsFunction').error.code).to.equal('VARIABLE_RESOLUTION_ERROR');
    expect(variablesMeta.get('jsPropertyFunction').error.code).to.equal(
      'VARIABLE_RESOLUTION_ERROR'
    );
  });
});
