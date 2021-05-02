'use strict';

const { expect } = require('chai');

const resolveMeta = require('../../../../../../lib/configuration/variables/resolve-meta');
const resolve = require('../../../../../../lib/configuration/variables/resolve');
const selfSource = require('../../../../../../lib/configuration/variables/sources/self');
const envSource = require('../../../../../../lib/configuration/variables/sources/env');

describe('test/unit/lib/configuration/variables/sources/env.test.js', () => {
  let configuration;
  let variablesMeta;
  before(async () => {
    process.env.ENV_SOURCE_TEST = 'foobar';
    configuration = {
      env: '${env:ENV_SOURCE_TEST}',
      envMissing: "${env:ENV_SOURCE_TEST_MISSING, 'fallback'}",
      noAddress: '${env:}',
      nonStringAddress: '${env:${self:someObject}}',
      someObject: {},
    };
    variablesMeta = resolveMeta(configuration);
    await resolve({
      serviceDir: process.cwd(),
      configuration,
      variablesMeta,
      sources: { env: envSource, self: selfSource },
      options: {},
      fulfilledSources: new Set(['env']),
    });
  });

  it('should resolve environment variable', () => expect(configuration.env).to.equal('foobar'));
  it('should resolve null on missing environment variable', () =>
    expect(configuration.envMissing).to.equal('fallback'));

  it('should report with an error missing address argument', () =>
    expect(variablesMeta.get('noAddress').error.code).to.equal('VARIABLE_RESOLUTION_ERROR'));

  it('should report with an error a non-string address argument', () =>
    expect(variablesMeta.get('nonStringAddress').error.code).to.equal('VARIABLE_RESOLUTION_ERROR'));
});
