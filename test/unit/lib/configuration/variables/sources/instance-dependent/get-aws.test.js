'use strict';

const { expect } = require('chai');
const _ = require('lodash');

const resolveMeta = require('../../../../../../../lib/configuration/variables/resolve-meta');
const resolve = require('../../../../../../../lib/configuration/variables/resolve');
const selfSource = require('../../../../../../../lib/configuration/variables/sources/self');
const getAwsSource = require('../../../../../../../lib/configuration/variables/sources/instance-dependent/get-aws');
const Serverless = require('../../../../../../../lib/serverless');

describe('test/unit/lib/configuration/variables/sources/instance-dependent/get-aws.test.js', () => {
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
        region: '${aws:region}',
        accountId: '${aws:accountId}',
        missingAddress: '${aws:}',
        invalidAddress: '${aws:invalid}',
        nonStringAddress: '${aws:${self:custom.someObject}}',
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
      commands: ['package'],
      options: {},
    });
    serverlessInstance.init();
    serverlessInstance.getProvider = () => ({
      constructor: {
        getProviderName: () => 'aws',
      },
      request: async () => {
        return {
          Account: '1234567890',
        };
      },
    });
    await resolve({
      serviceDir: process.cwd(),
      configuration,
      variablesMeta,
      sources: { self: selfSource, aws: getAwsSource(serverlessInstance) },
      options: options || {},
      fulfilledSources: new Set(['self', 'aws']),
    });
  };

  it('should resolve `accountId`', async () => {
    await initializeServerless();
    expect(configuration.custom.accountId).to.equal('1234567890');
  });

  it('should report with an error missing address', () =>
    expect(variablesMeta.get('custom\0missingAddress').error.code).to.equal(
      'VARIABLE_RESOLUTION_ERROR'
    ));

  it('should report with an error invalid address', () =>
    expect(variablesMeta.get('custom\0invalidAddress').error.code).to.equal(
      'VARIABLE_RESOLUTION_ERROR'
    ));

  it('should report with an error a non-string address', () =>
    expect(variablesMeta.get('custom\0nonStringAddress').error.code).to.equal(
      'VARIABLE_RESOLUTION_ERROR'
    ));

  it('should resolve ${aws:region}', async () => {
    // us-east-1 by default
    await initializeServerless();
    expect(configuration.custom.region).to.equal('us-east-1');
    // Resolves to provider.region if it exists
    await initializeServerless({
      provider: {
        region: 'eu-west-1',
      },
    });
    expect(configuration.custom.region).to.equal('eu-west-1');
    // Resolves to `--region=` if the option is set
    await initializeServerless(
      {
        provider: {
          region: 'eu-west-1',
        },
      },
      {
        region: 'eu-central-1',
      }
    );
    expect(configuration.custom.region).to.equal('eu-central-1');
  });
});
