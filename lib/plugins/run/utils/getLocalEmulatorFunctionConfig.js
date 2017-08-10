'use strict';

const _ = require('lodash');

function getLocalEmulatorFunctionConfig(functionConfig, providerConfig, servicePath) {
  const provider = functionConfig.provider || providerConfig.name;
  const envVars = _.merge(providerConfig.environment, functionConfig.environment);

  const localEmulatorFunctionConfig = {
    provider,
    handler: functionConfig.handler,
    servicePath,
    runtime: functionConfig.runtime || providerConfig.runtime,
  };

  if (provider === 'aws') {
    localEmulatorFunctionConfig.lambdaName = functionConfig.name;
    localEmulatorFunctionConfig.memorySize = Number(functionConfig.memorySize)
      || Number(providerConfig.memorySize)
      || 1024;
    localEmulatorFunctionConfig.region = providerConfig.region;
    localEmulatorFunctionConfig.envVars = envVars;
  } else if (provider === 'google') {
    localEmulatorFunctionConfig.env = {
      REGION: providerConfig.region,
      FUNCTION_NAME: functionConfig.name,
      MEMORY_SIZE: Number(functionConfig.memorySize)
      || Number(providerConfig.memorySize)
      || 1024,
    }

    localEmulatorFunctionConfig.env = _.merge(localEmulatorFunctionConfig.env,
      providerConfig.environment, functionConfig.environment);
  }

  return localEmulatorFunctionConfig;
}

module.exports = getLocalEmulatorFunctionConfig;
