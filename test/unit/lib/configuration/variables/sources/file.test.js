'use strict';

const { expect } = require('chai');

const path = require('path');
const resolveMeta = require('../../../../../../lib/configuration/variables/resolve-meta');
const resolve = require('../../../../../../lib/configuration/variables/resolve');
const fileSource = require('../../../../../../lib/configuration/variables/sources/file');

describe('test/unit/lib/configuration/variables/sources/file.test.js', () => {
  const serviceDir = path.resolve(__dirname, 'fixture');
  let configuration;
  let variablesMeta;
  before(async () => {
    configuration = {
      yaml: '${file(file.yaml)}',
      yml: '${file(file.yml)}',
      json: '${file(file.json)}',
      tfstate: '${file(file.tfstate)}',
      js: '${file(file.js)}',
      cjs: '${file(file.cjs)}',
      jsFunction: '${file(file-function.js)}',
      jsPropertyFunction: '${file(file-property-function.js):property}',
      jsPropertyFunctionProperty: '${file(file-property-function.js):property.result}',
      addressSupport: '${file(file.json):result}',
      jsFunctionResolveVariable: '${file(file-function-variable.js)}',
      jsFunctionResolveVariableMissingSource: '${file(file-function-variable-missing-source.js)}',
      jsFunctionResolveManyVariables: '${file(file-function-many-variables.js)}',
      jsPropertyFunctionResolveVariable: '${file(file-property-function-variable.js):property}',
      jsPropertyFunctionResolveVariableMissingSource:
        '${file(file-property-function-variable-missing-source.js):property}',
      nestedVariablesAddressResolution: '${file(file-variables-nest-1.yaml):n1.n2.n3}',
      nonExistingYaml: '${file(not-existing.yaml), null}',
      nonExistingJson: '${file(not-existing.json), null}',
      nonExistingJs: '${file(not-existing.js), null}',
      primitiveAddress: '${file(file-primitive.json):someProperty, null}',
      ambiguousAddress: '${file(file-ambiguous.json):foo.bar}',
      deepNotExistingAddress: '${file(file.json):result.foo.bar, null}',
      jsFilePromiseRejected: '${file(file-promise-rejected.js)}',
      jsFilePromiseRejectedNonError: '${file(file-promise-rejected-non-error.js)}',
      jsFileFunctionErrored: '${file(file-function-errored.js)}',
      jsFileFunctionAccessUnresolvableProperty:
        '${file(file-function-access-unresolvable-property.js)}',
      jsFileFunctionErroredNonError: '${file(file-function-errored-non-error.js)}',
      jsFilePropertyFunctionErrored: '${file(file-property-function-errored.js):property}',
      jsFilePropertyFunctionErroredNonError:
        '${file(file-property-function-errored-non-error.js):property}',
      jsFilePropertyFunctionAccessUnresolvableProperty:
        '${file(file-property-function-access-unresolvable-property.js):property}',
      jsFilePropertyPromise: '${file(file-property-promise.js):property}',
      notFile: '${file(dir.yaml)}',
      noParams: '${file:}',
      noParams2: '${file():}',
      invalidYaml: '${file(invalid.yml)}',
      invalidJson: '${file(invalid.json)}',
      invalidJs: '${file(invalid.js)}',
      invalidJs2: '${file(invalid2.js)}',
      nonStandardExt: '${file(non-standard.ext)}',
      unresolvable: '${unknown:}',
    };
    variablesMeta = resolveMeta(configuration);
    await resolve({
      serviceDir,
      configuration,
      variablesMeta,
      sources: { file: fileSource },
      options: {},
      fulfilledSources: new Set(['file']),
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

  it('should resolve "cjs" file sources', () =>
    expect(configuration.cjs).to.deep.equal({ result: 'cjs' }));

  it('should support function resolvers in "js" file sources', () =>
    expect(configuration.jsFunction).to.deep.equal({ result: 'js-function' }));

  it('should support function property resolvers in "js" file sources', () =>
    expect(configuration.jsPropertyFunction).to.deep.equal({ result: 'js-property-function' }));

  it('should support promise property resolvers in "js" file sources', () =>
    expect(configuration.jsFilePropertyPromise).to.deep.equal({ result: 'js-property-promise' }));

  it('should resolves properties on objects returned by function property resolvers in "js" file sources', () =>
    expect(configuration.jsPropertyFunctionProperty).to.equal('js-property-function'));

  it('should support "address" argument', () =>
    expect(configuration.addressSupport).to.equal('json'));

  it('should support internal variable resolution', () => {
    expect(configuration.jsFunctionResolveVariable).to.deep.equal({
      varResult: { result: 'yaml' },
    });
    expect(configuration.jsPropertyFunctionResolveVariable).to.deep.equal({
      varResult: { result: 'json' },
    });
    expect(configuration.jsFunctionResolveManyVariables).to.deep.equal({
      varResult: { result: ['yml', 'yml', 'yml', 'yml', 'yml', 'yml', 'yml', 'yml', 'yml', 'yml'] },
    });
  });

  it('should resolve variables across address resolution', () => {
    expect(configuration.nestedVariablesAddressResolution).to.deep.equal('result');
  });
  it('should uncoditionally split "address" property keys by "."', () =>
    expect(configuration.ambiguousAddress).to.equal('object'));

  it('should report with null non existing files', () =>
    expect(configuration.nonExistingYaml).to.equal(null));

  it('should report with null non existing JSON files', () =>
    expect(configuration.nonExistingJson).to.equal(null));

  it('should report with null non existing JS files', () =>
    expect(configuration.nonExistingJs).to.equal(null));

  it('should report with null non existing addresses', () => {
    expect(configuration.primitiveAddress).to.equal(null);
    expect(configuration.deepNotExistingAddress).to.equal(null);
  });

  it('should resolve plain text content on unrecognized extension', () =>
    // .trim() as depending on local .git settings and OS (Windows or other)
    // checked out fixture may end with differen type of EOL (\n on linux, and \r\n on Windows)
    expect(configuration.nonStandardExt.trim()).to.equal('result: non-standard'.trim()));

  it('should mark as unresolved if function crashes with misisng property dependency', () => {
    const propertyMeta = variablesMeta.get('jsFileFunctionAccessUnresolvableProperty');
    if (propertyMeta.error) throw propertyMeta.error;
    expect(propertyMeta).to.have.property('variables');
  });
  it('should mark as unresolved if property function crashes with misisng property dependency', () => {
    const propertyMeta = variablesMeta.get('jsFilePropertyFunctionAccessUnresolvableProperty');
    if (propertyMeta.error) throw propertyMeta.error;
    expect(propertyMeta).to.have.property('variables');
  });

  it('should report with an error promise rejected with error', () =>
    expect(variablesMeta.get('jsFilePromiseRejected').error.code).to.equal(
      'VARIABLE_RESOLUTION_ERROR'
    ));

  it('should report with an error promise rejected with non error value', () =>
    expect(variablesMeta.get('jsFilePromiseRejectedNonError').error.code).to.equal(
      'VARIABLE_RESOLUTION_ERROR'
    ));

  it('should report with an error function resolver that crashes with error', () =>
    expect(variablesMeta.get('jsFileFunctionErrored').error.code).to.equal(
      'VARIABLE_RESOLUTION_ERROR'
    ));

  it('should report with an error function resolver that crashes not with error', () =>
    expect(variablesMeta.get('jsFileFunctionErroredNonError').error.code).to.equal(
      'VARIABLE_RESOLUTION_ERROR'
    ));

  it('should report with an error property function resolver that crashes with error', () =>
    expect(variablesMeta.get('jsFilePropertyFunctionErrored').error.code).to.equal(
      'VARIABLE_RESOLUTION_ERROR'
    ));

  it('should report with an error property function resolver that crashes not with error', () =>
    expect(variablesMeta.get('jsFilePropertyFunctionErroredNonError').error.code).to.equal(
      'VARIABLE_RESOLUTION_ERROR'
    ));

  it('should report with an error non file paths', () =>
    expect(variablesMeta.get('notFile').error.code).to.equal('VARIABLE_RESOLUTION_ERROR'));

  it('should report with an error missing path argument', () => {
    expect(variablesMeta.get('noParams').error.code).to.equal('VARIABLE_RESOLUTION_ERROR');
    expect(variablesMeta.get('noParams2').error.code).to.equal('VARIABLE_RESOLUTION_ERROR');
  });

  it('should report with an error an invalid YAML file', () =>
    expect(variablesMeta.get('invalidYaml').error.code).to.equal('VARIABLE_RESOLUTION_ERROR'));

  it('should report with an error an invalid JSON file', () =>
    expect(variablesMeta.get('invalidJson').error.code).to.equal('VARIABLE_RESOLUTION_ERROR'));

  it('should report with an error an invalid JS file', () => {
    expect(variablesMeta.get('invalidJs').error.code).to.equal('VARIABLE_RESOLUTION_ERROR');
    expect(variablesMeta.get('invalidJs2').error.code).to.equal('VARIABLE_RESOLUTION_ERROR');
  });

  it('should report with an error if JS function attempts to resolve missing source', () =>
    expect(variablesMeta.get('jsFunctionResolveVariableMissingSource').error.code).to.equal(
      'MISSING_VARIABLE_RESULT'
    ));

  it('should report with an error if JS function property attempts to resolve missing source', () =>
    expect(variablesMeta.get('jsPropertyFunctionResolveVariableMissingSource').error.code).to.equal(
      'MISSING_VARIABLE_RESULT'
    ));

  it('should support reaching out beyond service directory', async () => {
    configuration = {
      yml: '${file(../file.yml)}',
    };
    variablesMeta = resolveMeta(configuration);
    await resolve({
      serviceDir: path.resolve(serviceDir, 'foo'),
      configuration,
      variablesMeta,
      sources: { file: fileSource },
      options: {},
      fulfilledSources: new Set(['file']),
    });
    expect(configuration.yml).to.deep.equal({ result: 'yml' });
  });
});
