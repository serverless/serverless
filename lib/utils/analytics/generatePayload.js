'use strict';

const _ = require('lodash');

const versions = {
  'serverless': require('../../../package').version,
  '@serverless/enterprise-plugin': require('@serverless/enterprise-plugin/package').version,
};

module.exports = serverless => {
  const { service: serviceConfig } = serverless;
  const { provider: providerConfig } = serviceConfig;
  const provider = serverless.getProvider(providerConfig.name);

  const isAwsProvider = providerConfig.name === 'aws';

  const defaultRuntime = isAwsProvider ? provider.getRuntime() : providerConfig.runtime;
  return {
    cliName: 'serverless',
    config: {
      provider: {
        name: providerConfig.name,
        runtime: defaultRuntime,
        stage: isAwsProvider ? provider.getStage() : providerConfig.stage,
        region: isAwsProvider ? provider.getRegion() : providerConfig.region,
      },
      plugins: serviceConfig.plugins ? serviceConfig.plugins.modules || serviceConfig.plugins : [],
      functions: _.values(serviceConfig.functions).map(functionConfig => ({
        runtime: functionConfig.runtime || defaultRuntime,
        events: functionConfig.events.map(eventConfig => ({
          type: Object.keys(eventConfig)[0] || null,
        })),
      })),
    },
    versions,
    isDashboardEnabled: Boolean(serverless.enterpriseEnabled),
  };
};
