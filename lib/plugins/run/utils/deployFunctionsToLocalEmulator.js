'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');
const getLocalEmulatorFunctionConfig = require('./getLocalEmulatorFunctionConfig');
const deployFunctionToLocalEmulator = require('./deployFunctionToLocalEmulator');
const logLocalEmulator = require('./logLocalEmulator');

function deployFunctionsToLocalEmulator(service, servicePath, localEmulatorRootUrl) {
  const functionDeploymentPromises = [];

  _.each(service.functions, (functionConfig, functionName) => {
    const localEmulatorFunctionConfig = getLocalEmulatorFunctionConfig(
      functionConfig,
      service.provider,
      servicePath);

    const deployFunctionToLocalEmulatorPromise = deployFunctionToLocalEmulator(
      `${service.service}-${functionName}`,
      localEmulatorFunctionConfig, localEmulatorRootUrl);
    functionDeploymentPromises.push(deployFunctionToLocalEmulatorPromise);
  });


  if (functionDeploymentPromises.length === 0) {
    const noFunctions = true;
    return BbPromise.resolve(noFunctions);
  }

  // NOTE important for UX since it takes a while to upload large functions
  logLocalEmulator('Functions loading...');

  return BbPromise.all(functionDeploymentPromises);
}

module.exports = deployFunctionsToLocalEmulator;
