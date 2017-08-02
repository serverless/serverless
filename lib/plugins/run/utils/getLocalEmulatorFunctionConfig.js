'use strict';

const _ = require('lodash');

function getLocalEmulatorFunctionConfig(functionConfig, providerConfig, servicePath) {
  const envVars = _.merge(providerConfig.environment, functionConfig.environment);

  const localEmulatorFunctionConfig = {
    handler: functionConfig.handler,
    servicePath,
    lambdaName: functionConfig.name,
    memorySize: Number(functionConfig.memorySize)
    || Number(providerConfig.memorySize)
    || 1024,
    region: providerConfig.region,
    envVars,
  };

  return localEmulatorFunctionConfig;
}

module.exports = getLocalEmulatorFunctionConfig;
