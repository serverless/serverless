'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');
const chalk = require('chalk');
const childProcess = BbPromise.promisifyAll(require('child_process'));
const fdk = require('@serverless/fdk');
const path = require('path');
const os = require('os');
const latestVersion = require('latest-version');

const getConfigureConfig = require('./utils/getConfigureConfig');
const getLocalRootUrl = require('./utils/getLocalRootUrl');
const getLocalEmulatorFunctionConfig = require('./utils/getLocalEmulatorFunctionConfig');
const deployFunctionToLocalEmulator = require('./utils/deployFunctionToLocalEmulator');

const localEmulatorRunning = require('./utils/localEmulatorRunning');
const eventGatewayRunning = require('./utils/eventGatewayRunning');

const localEmulatorInstalled = require('./utils/localEmulatorInstalled');
const eventGatewayInstalled = require('./utils/eventGatewayInstalled');

const installLocalEmulator = require('./utils/installLocalEmulator');
const installEventGateway = require('./utils/installEventGateway');
const getLatestEventGatewayVersion = require('./utils/getLatestEventGatewayVersion');
const getTmpDirPath = require('./utils/getTmpDirPath');

const logEventGateway = require('./utils/logEventGateway');

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
        options: {
          eport: {
            usage: 'The Event Gateway API port',
            shortcut: 'e',
            default: '4000',
          },
          cport: {
            usage: 'The Event Gateway configuration port',
            shortcut: 'e',
            default: '4001',
          },
          lport: {
            usage: 'The Local Emulator port',
            shortcut: 'l',
            default: '4002',
          },
        },
      },
    };

    this.hooks = {
      'run:run': () => BbPromise.bind(this)
        .then(this.run),
    };
  }

  run() {
    let functionsDeployed = false;
    let functionsRegistered = false;
    if (!this.serverless.config.servicePath) {
      throw new this.serverless.classes
        .Error('This command can only run inside a service');
    }

    return localEmulatorRunning(getLocalRootUrl(this.options.lport))
      .then(localEmulatorAlreadyRunning => {
        if (localEmulatorAlreadyRunning) {
          this.logServerless('Local Emulator Already Running');
          functionsDeployed = true;
          return this.deployFunctionsToLocalEmulator();
        }
        return BbPromise.resolve();
      })
      .then(() => eventGatewayRunning(getLocalRootUrl(this.options.cport)))
      .then(eventGatewayAlreadyRunning => {
        if (eventGatewayAlreadyRunning) {
          functionsRegistered = true;
          this.logServerless('Event Gateway Already Running');
          return this.registerFunctionsToEventGateway();
        }
        return BbPromise.resolve();
      })
      .then(() => latestVersion('@serverless/emulator'))
      .then(latestLocalEmulatorVersion => {
        if (!functionsDeployed && !localEmulatorInstalled(latestLocalEmulatorVersion)) {
          this.logServerless('Installing Local Emulator');
          installLocalEmulator();
        }
        return BbPromise.resolve();
      })
      .then(() => getLatestEventGatewayVersion())
      .then(latestEventGatewayVersion => {
        if (!eventGatewayInstalled(latestEventGatewayVersion)) {
          this.logServerless('Installing Event Gateway');
          return installEventGateway(latestEventGatewayVersion);
        }
        return BbPromise.resolve();
      })
      .then(() =>
        new BbPromise((resolve, reject) => {
          if (!functionsDeployed) {
            let initialized = false;
            this.logServerless('Spinning Up the Local Emulator');
            const localEmulatorChildProcess = childProcess.spawn('sle',
              ['--port', this.options.lport]);

            localEmulatorChildProcess.stdout.on('data', chunk => {
              this.logLocalEmulator(chunk.toString('utf8'));
              if (!initialized) {
                initialized = true;
                return this.deployFunctionsToLocalEmulator();
              }
              return BbPromise.resolve();
            });

            localEmulatorChildProcess.stderr.on('data', chunk => {
              this.logLocalEmulator(chunk.toString('utf8'));
            });

            localEmulatorChildProcess.on('close', () => resolve());
            localEmulatorChildProcess.on('error', error => reject(error));
          }

          if (!functionsRegistered) {
            let initialized = false;
            const eventGatewayBinaryFilePath = path
              .join(os.homedir(), '.serverless', 'event-gateway', 'event-gateway');
            this.logServerless('Spinning Up the Event Gateway');

            const args = [
              `--embed-data-dir=${getTmpDirPath()}`,
              '-log-level=debug',
              '--dev',
              '--log-format=json',
            ];

            const eventGatewayChildProcess = childProcess
              .spawn(eventGatewayBinaryFilePath, args);

            eventGatewayChildProcess.stdout.on('data', chunk => {
              logEventGateway(chunk.toString('utf8'));
            });

            eventGatewayChildProcess.stderr.on('data', chunk => {
              logEventGateway(chunk.toString('utf8'));
              if (!initialized) {
                initialized = true;
                setTimeout(() => this.registerFunctionsToEventGateway(), 2000);
              }
            });

            eventGatewayChildProcess.on('close', () => resolve());
            eventGatewayChildProcess.on('error', error => reject(error));
          }
        })
      );
  }

  deployFunctionsToLocalEmulator() {
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
        serviceName, functionName,
        localEmulatorFunctionConfig, getLocalRootUrl(this.options.lport));
      functionDeploymentPromises.push(deployFunctionToLocalEmulatorPromise);
    });

    return BbPromise.all(functionDeploymentPromises);
  }

  registerFunctionsToEventGateway() {
    const gateway = fdk.eventGateway({
      url: getLocalRootUrl(this.options.eport),
      configurationUrl: getLocalRootUrl(this.options.cport),
    });

    const configureConfig = getConfigureConfig(this.serverless.service,
      getLocalRootUrl(this.options.lport));

    return gateway.configure(configureConfig);
  }

  logServerless(message) {
    process.stdout.write(`${chalk.yellow(' Serverless     |  ')}${message}\n`);
  }

  logLocalEmulator(message) {
    process.stdout.write(`${chalk.green(' Local Emulator |  ')}${message.trim()}\n`);
  }
}

module.exports = Run;
