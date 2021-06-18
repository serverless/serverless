'use strict';

const { expect } = require('chai');
const _ = require('lodash');

const resolveMeta = require('../../../../../../../lib/configuration/variables/resolve-meta');
const resolve = require('../../../../../../../lib/configuration/variables/resolve');
const selfSource = require('../../../../../../../lib/configuration/variables/sources/self');
const getSlsSource = require('../../../../../../../lib/configuration/variables/sources/instance-dependent/get-sls');
const Serverless = require('../../../../../../../lib/Serverless');

describe('test/unit/lib/configuration/variables/sources/instance-dependent/get-sls.test.js', () => {
  let configuration;
  let variablesMeta;
  let serverlessInstance;

  const initializeServerless = async (configExt, options) => {
    configuration = {
      service: 'foo',
      provider: {
        name: 'aws',
      },
      custom: {
        sls: '${sls:instanceId}',
        stage: '${sls:stage}',
        missingAddress: '${sls:}',
        unsupportedAddress: '${sls:foo}',
        nonStringAddress: '${sls:${self:custom.someObject}}',
        someObject: {},
      },
    };
    if (configExt) {
      configuration = _.merge(configuration, configExt);
    }
    variablesMeta = resolveMeta(configuration);
    serverlessInstance = new Serverless({
      configuration,
      serviceDir: process.cwd(),
      configurationFilename: 'serverless.yml',
      isConfigurationResolved: true,
      hasResolvedCommandsExternally: true,
      commands: ['package'],
      options: {},
    });
    serverlessInstance.init();
    await resolve({
      serviceDir: process.cwd(),
      configuration,
      variablesMeta,
      sources: { self: selfSource, sls: getSlsSource(serverlessInstance) },
      options: options || {},
      fulfilledSources: new Set(['self', 'sls']),
    });
  };

  it('should resolve ${sls.instanceId}', async () => {
    await initializeServerless();
    if (variablesMeta.get('custom\0sls')) throw variablesMeta.get('custom\0sls').error;
    expect(typeof serverlessInstance.instanceId).to.equal('string');
    expect(configuration.custom.sls).to.equal(serverlessInstance.instanceId);
  });

  it('should resolve ${sls:stage}', async () => {
    // Dev by default
    await initializeServerless();
    expect(configuration.custom.stage).to.equal('dev');
    // Resolves to provider.stage if it exists
    await initializeServerless({
      provider: {
        stage: 'prod',
      },
    });
    expect(configuration.custom.stage).to.equal('prod');
    // Resolves to `--stage=` if the option is set
    await initializeServerless(
      {
        provider: {
          stage: 'prod',
        },
      },
      {
        stage: 'staging',
      }
    );
    expect(configuration.custom.stage).to.equal('staging');
  });

  it('should report with an error missing address', async () => {
    await initializeServerless();
    return expect(variablesMeta.get('custom\0missingAddress').error.code).to.equal(
      'VARIABLE_RESOLUTION_ERROR'
    );
  });

  it('should report with an error unsupported address', async () => {
    await initializeServerless();
    return expect(variablesMeta.get('custom\0unsupportedAddress').error.code).to.equal(
      'VARIABLE_RESOLUTION_ERROR'
    );
  });

  it('should report with an error a non-string address', async () => {
    await initializeServerless();
    return expect(variablesMeta.get('custom\0nonStringAddress').error.code).to.equal(
      'VARIABLE_RESOLUTION_ERROR'
    );
  });
});
