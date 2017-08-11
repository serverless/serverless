'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');
const getLocalEmulatorFunctionConfig = require('./getLocalEmulatorFunctionConfig');
const deployFunctionToLocalEmulator = require('./deployFunctionToLocalEmulator');

function deployFunctionsToLocalEmulator(service, servicePath, localEmulatorRootUrl) {
  const functionDeploymentPromises = [];

  _.each(service.functions, (functionConfig, functionName) => {
    const localEmulatorFunctionConfig = getLocalEmulatorFunctionConfig(
      functionConfig,
      service.provider,
      servicePath);

    const deployFunctionToLocalEmulatorPromise = deployFunctionToLocalEmulator(
      service.service, functionName,
      localEmulatorFunctionConfig, localEmulatorRootUrl);
    functionDeploymentPromises.push(deployFunctionToLocalEmulatorPromise);
  });

  return BbPromise.all(functionDeploymentPromises);
}

module.exports = deployFunctionsToLocalEmulator;
