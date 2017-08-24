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
    localEmulatorFunctionConfig.functionName = functionConfig.name;
    localEmulatorFunctionConfig.memorySize = Number(functionConfig.memorySize)
      || Number(providerConfig.memorySize)
      || 1024;
    localEmulatorFunctionConfig.region = providerConfig.region;
    localEmulatorFunctionConfig.envVars = envVars;
  } else if (provider === 'google') {
    const memorySize = Number(functionConfig.memorySize)
      || Number(providerConfig.memorySize)
      || 1024;
    localEmulatorFunctionConfig.functionName = functionConfig.name;
    // TODO localEmulatorFunctionConfig.eventType = ?
    localEmulatorFunctionConfig.project = providerConfig.project;
    localEmulatorFunctionConfig.memorySize = memorySize;
    localEmulatorFunctionConfig.env = {
      REGION: providerConfig.region,
      FUNCTION_NAME: functionConfig.name,
      MEMORY_SIZE: memorySize,
    };

    localEmulatorFunctionConfig.env = _.merge(localEmulatorFunctionConfig.env,
      providerConfig.environment, functionConfig.environment);
  }

  return localEmulatorFunctionConfig;
}

module.exports = getLocalEmulatorFunctionConfig;
