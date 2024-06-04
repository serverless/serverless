'use strict';

const { expect } = require('chai');

const resolveMeta = require('../../../../../../lib/configuration/variables/resolve-meta');
const resolve = require('../../../../../../lib/configuration/variables/resolve');
const selfSource = require('../../../../../../lib/configuration/variables/sources/self');
const jsonParseSource = require('../../../../../../lib/configuration/variables/sources/json-parse');

describe('test/unit/lib/configuration/variables/sources/json-parse.test.js', () => {
  const fooJson = { foo: 'bar', foo2: { foo: 'bar2'} };

  let configuration;
  let variablesMeta;
  before(async () => {
    configuration = {
      // set values to be able to test jsonParse
      fooJson,
      fooJsonString: JSON.stringify(fooJson),

      jsonValFromString: '${jsonParse(${self:fooJsonString}):foo}',
      jsonValFromStringNested: '${jsonParse(${self:fooJsonString}):foo2.foo}',
      jsonObjFromString: '${jsonParse(${self:fooJsonString})}',
      jsonObjParse: '${jsonParse(${self:fooJson})}', // handle json object
      jsonObjParseKey: '${jsonParse(${self:fooJson}):foo}', // handle json object

      errorFromMalformedString: '${jsonParse("bad json value...")}',
      errorFromEmptyString: '${jsonParse()}',
      errorFromBadNested: '${jsonParse(fooJson):foo.foo2}',
    };
    variablesMeta = resolveMeta(configuration);
    await resolve({
      serviceDir: process.cwd(),
      configuration,
      variablesMeta,
      sources: { jsonParse: jsonParseSource, self: selfSource },
      options: {},
      fulfilledSources: new Set(['jsonParse']),
    });
  });

  it('should extract \'bar\' value from json string', () =>
    expect(configuration.jsonValFromString).to.equal('bar'));

  it('should extract \'bar2\' value from json string', () =>
    expect(configuration.jsonValFromStringNested).to.equal('bar2'));

  it('should extract object from json string', () =>
    expect(configuration.jsonObjFromString).to.deep.equal(fooJson));

  it('should extract object from object', () =>
    expect(configuration.jsonObjParse).to.deep.equal(fooJson));

  it('should extract key from object', () =>
    expect(configuration.jsonObjParseKey).to.deep.equal('bar'));


  it('should report error on invalid json string', () =>
    expect(variablesMeta.get('errorFromMalformedString').error.code).to.equal(
      'VARIABLE_RESOLUTION_ERROR'
    ));

  it('should report error on empty json / json string', () =>
    expect(variablesMeta.get('errorFromEmptyString').error.code).to.equal(
      'VARIABLE_RESOLUTION_ERROR'
    ));

  it('should report error on bad nested path', () =>
    expect(variablesMeta.get('errorFromBadNested').error.code).to.equal(
      'VARIABLE_RESOLUTION_ERROR'
    ));
});
