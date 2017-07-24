'use strict';

const BbPromise = require('bluebird');
const getLocalEmulatorFunctionConfig = require('./utils/getLocalEmulatorFunctionConfig');
const deployFunctionToLocalEmulator = require('./utils/deployFunctionToLocalEmulator');

class Run {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      run: {
        usage: 'Runs the Event Gateway and the Local Emulator',
        lifecycleEvents: [
          'run',
        ],
      },
    };

    this.hooks = {
      'run:run': () => BbPromise.bind(this)
        .then(this.installLocalEmulator)
        .then(this.installEventGateway)
        .then(this.spinUpLocalEmulator)
        .then(this.spinUpEventGateway)
        .then(this.deployFunctionsToLocalEmulator),
    };
  }

  installLocalEmulator() {
    return BbPromise.resolve();
  }

  installEventGateway() {
    return BbPromise.resolve();
  }

  spinUpLocalEmulator() {
    return BbPromise.resolve();
  }

  spinUpEventGateway() {
    return BbPromise.resolve();
  }

  deployFunctionsToLocalEmulator() {
    const service = this.serverless.service;
    const serviceName = service.service;
    const providerEnvVars = service.provider.environment;
    const functionDeploymentPromises = [];

    _.each(service.functions, (functionConfig,
     functionName) => {
      const localEmulatorFunctionConfig = getLocalEmulatorFunctionConfig(
        functionConfig,
        providerEnvVars,
        this.serverless.config.servicePath);
      functionDeploymentPromises.push(() => deployFunctionToLocalEmulator(
        functionName, serviceName, localEmulatorFunctionConfig));
    });

    return BbPromise.all(functionDeploymentPromises);
  }
}

module.exports = Run;
