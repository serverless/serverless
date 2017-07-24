'use strict';

const _ = require('lodash');
const path = require('path');

function getLocalEmulatorFunctionConfig(functionConfig, providerConfig, servicePath) {
  const envVars = _.merge(providerConfig.environment, functionConfig.environment);

  const handlerPartialPath = functionConfig.handler.split('.')[0];
  const handlerPath = path.join(servicePath, handlerPartialPath);

  const localEmulatorFunctionConfig = {
    handler: functionConfig.handler,
    handlerPath,
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
