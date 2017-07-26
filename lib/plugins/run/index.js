'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');
const chalk = require('chalk');
const childProcess = BbPromise.promisifyAll(require('child_process'));
const getLocalEmulatorFunctionConfig = require('./utils/getLocalEmulatorFunctionConfig');
const deployFunctionToLocalEmulator = require('./utils/deployFunctionToLocalEmulator');
const localEmulatorRunning = require('./utils/localEmulatorRunning');

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
        .then(this.run),
    };
  }

  run() {
    if (!this.serverless.config.servicePath) {
      throw new this.serverless.classes
        .Error('This command can only run inside a service');
    }
    if (!this.localEmulatorInstalled()) {
      this.logServerless('Installing Local Emulator...');
      this.installLocalEmulator();
    }

    return localEmulatorRunning()
      .then(running => {
        return new BbPromise((resolve, reject) => {
          if (running) {
            this.logServerless('Local Emulator Already Running');
            return this.deployFunctionsToLocalEmulator();
          }

          let alreadyDeployed = false;
          this.logServerless('Spinning Up the Local Emulator...');
          const localEmulatorChildProcess = childProcess.spawn('node',
            ['/Users/eslam/serverless-stuff/local-emulator/dist/index.js']);

          localEmulatorChildProcess.stdout.on('data', chunk => {
            this.logLocalEmulator(chunk.toString('utf8'));
            if (!alreadyDeployed) {
              alreadyDeployed = true;
              return this.deployFunctionsToLocalEmulator();
            }
          });

          localEmulatorChildProcess.stderr.on('data', chunk => {
            this.logLocalEmulator(chunk.toString('utf8'));
          });

          localEmulatorChildProcess.on('close', () => resolve());
          localEmulatorChildProcess.on('error', error => reject(error));
        });
      });
  }

  deployFunctionsToLocalEmulator() {
    this.logServerless('Deploying Functions to Local Emulator...');
    const service = this.serverless.service;
    const serviceName = service.service;
    const providerConfig = service.provider;
    const functionDeploymentPromises = [];

    _.each(service.functions, (functionConfig,
     functionName) => {
      const localEmulatorFunctionConfig = getLocalEmulatorFunctionConfig(
        functionConfig,
        providerConfig,
        this.serverless.config.servicePath);

      const deployFunctionToLocalEmulatorPromise = deployFunctionToLocalEmulator(
        functionName, serviceName, localEmulatorFunctionConfig);
      functionDeploymentPromises.push(deployFunctionToLocalEmulatorPromise);
    });

    return BbPromise.all(functionDeploymentPromises)
      .then(() => this.logServerless('Functions Deployed!'));
  }

  localEmulatorInstalled() {
    const stdout = childProcess.execSync('npm list -g serverless-local-emulator');
    const stdoutString = new Buffer(stdout, 'base64').toString();
    return stdoutString.includes('serverless-local-emulator');
  }

  installLocalEmulator() {
    this.logServerless('Installing Local Emulator...');
    const stdout = childProcess.execSync('npm install -g serverless-local-emulator');
    const stdoutString = new Buffer(stdout, 'base64').toString();
    return stdoutString.includes('serverless-local-emulator');
  }

  logServerless(message) {
    process.stdout.write(chalk.yellow(`Serverless: ${message}\n`));
  }

  logLocalEmulator(message) {
    process.stdout.write(chalk.green(`Local Emulator: ${message.trim()}\n`));
  }
}

module.exports = Run;
