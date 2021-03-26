'use strict';

const { expect } = require('chai');

const resolveMeta = require('../../../../../../../lib/configuration/variables/resolve-meta');
const resolve = require('../../../../../../../lib/configuration/variables/resolve');
const selfSource = require('../../../../../../../lib/configuration/variables/sources/self');
const getSlsSource = require('../../../../../../../lib/configuration/variables/sources/instance-dependent/get-sls');
const Serverless = require('../../../../../../../lib/Serverless');

describe('test/unit/lib/configuration/variables/sources/instance-dependent/get-sls.test.js', () => {
  let configuration;
  let variablesMeta;
  let serverlessInstance;

  before(async () => {
    configuration = {
      service: 'foo',
      provider: { name: 'aws' },
      custom: {
        sls: '${sls:instanceId}',
        missingAddress: '${sls:}',
        unsupportedAddress: '${sls:foo}',
        nonStringAddress: '${sls:${self:custom.someObject}}',
        someObject: {},
      },
    };
    variablesMeta = resolveMeta(configuration);
    serverlessInstance = new Serverless({
      configuration,
      configurationPath: process.cwd(),
      isConfigurationResolved: true,
      hasResolvedCommandsExternally: true,
      commands: ['package'],
      options: {},
    });
    serverlessInstance.init();
    await resolve({
      servicePath: process.cwd(),
      configuration,
      variablesMeta,
      sources: { self: selfSource, sls: getSlsSource(serverlessInstance) },
      options: {},
      fulfilledSources: new Set(['self', 'sls']),
    });
  });

  it('should resolve instanceId', () => {
    if (variablesMeta.get('custom\0sls')) throw variablesMeta.get('custom\0sls').error;
    expect(typeof serverlessInstance.instanceId).to.equal('string');
    expect(configuration.custom.sls).to.equal(serverlessInstance.instanceId);
  });

  it('should report with an error missing address', () =>
    expect(variablesMeta.get('custom\0missingAddress').error.code).to.equal(
      'VARIABLE_RESOLUTION_ERROR'
    ));

  it('should report with an error unsupported address', () =>
    expect(variablesMeta.get('custom\0unsupportedAddress').error.code).to.equal(
      'VARIABLE_RESOLUTION_ERROR'
    ));

  it('should report with an error a non-string address', () =>
    expect(variablesMeta.get('custom\0nonStringAddress').error.code).to.equal(
      'VARIABLE_RESOLUTION_ERROR'
    ));
});
