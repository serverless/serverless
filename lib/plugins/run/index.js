'use strict';
/*
 curl --request POST \
 --url http://127.0.0.1:8081/v1/functions \
 --header 'content-type: application/json' \
 --data '{"functionId": "hello", "provider":{"type": "http", "url": "http://localhost:8082/v0/emulator/api/functions/invoke"'
 */

/*
 * test
 */
const BbPromise = require('bluebird');
const _ = require('lodash');
const chalk = require('chalk');
const childProcess = BbPromise.promisifyAll(require('child_process'));
const fdk = require('fdk'); // not published yet
const path = require('path');
const os = require('os');

const getLocalRootUrl = require('./utils/getLocalRootUrl');
const getLocalEmulatorFunctionConfig = require('./utils/getLocalEmulatorFunctionConfig');
const deployFunctionToLocalEmulator = require('./utils/deployFunctionToLocalEmulator');

const localEmulatorRunning = require('./utils/localEmulatorRunning');
const eventGatewayRunning = require('./utils/eventGatewayRunning');

const localEmulatorInstalled = require('./utils/localEmulatorInstalled');
const eventGatewayInstalled = require('./utils/eventGatewayInstalled');

const installLocalEmulator = require('./utils/installLocalEmulator');
const installEventGateway = require('./utils/installEventGateway');

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
      .then(() => {
        if (!localEmulatorInstalled()) {
          this.logServerless('Installing Local Emulator...');
          installLocalEmulator();
        }
        return BbPromise.resolve();
      })
      .then(() => {
        if (!eventGatewayInstalled()) {
          return installEventGateway();
        }
        return BbPromise.resolve();
      })
      .then(() => {
        return new BbPromise((resolve, reject) => {
          if (!functionsDeployed) {
            let initialized = false;
            this.logServerless('Spinning Up the Local Emulator...');
            const localEmulatorChildProcess = childProcess.spawn('node',
              ['/Users/eslam/serverless-stuff/local-emulator/dist/index.js',
                '--port', this.options.port]);

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
            this.logServerless('Spinning Up the Event Gateway...');
            const eventGatewayChildProcess = childProcess
              .spawn(eventGatewayBinaryFilePath, ['--dev']);

            eventGatewayChildProcess.stdout.on('data', chunk => {
              this.logEventGateway(chunk.toString('utf8'));
              // if (!initialized) {
              //   initialized = true;
              //   return this.registerFunctionsToEventGateway();
              // }
            });

            eventGatewayChildProcess.stderr.on('data', chunk => {
              this.logEventGateway(chunk.toString('utf8'));
            });

            eventGatewayChildProcess.on('close', () => resolve());
            eventGatewayChildProcess.on('error', error => reject(error));
          }
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
        serviceName, functionName,
        localEmulatorFunctionConfig, getLocalRootUrl(this.options.lport));
      functionDeploymentPromises.push(deployFunctionToLocalEmulatorPromise);
    });

    return BbPromise.all(functionDeploymentPromises)
      .then(() => this.logServerless('Functions Deployed!'));
  }

  registerFunctionsToEventGateway() {
    this.logServerless('Registering Functions to the Event Gateway...');

    const gateway = fdk.eventGateway({
      url: getLocalRootUrl(this.options.eport),
      configurationUrl: getLocalRootUrl(this.options.cport),
    });
    const functionsArray = [];
    const service = this.serverless.service;
    const serviceName = service.service;

    _.each(service.functions, (functionConfig,
                               functionName) => {
      const functionId = `${serviceName}-${functionName}`;
      const invokeFunctionUrl = `${getLocalRootUrl(this.options.lport)
      }/v0/emulator/api/invoke/${serviceName}/${functionName}`;

      const functionObject = {
        functionId,
        provider: {
          type: 'http',
          url: invokeFunctionUrl,
        },
      };
      functionsArray.push(functionObject);
    });

    return gateway.configure({ functions: functionsArray })
      .then(() => this.logServerless('Functions Registered in the Event Gateway!'));
  }

  logServerless(message) {
    process.stdout.write(chalk.yellow(` Serverless     |  ${message}\n`));
  }

  logLocalEmulator(message) {
    process.stdout.write(chalk.green(` Local Emulator |  ${message.trim()}\n`));
  }

  logEventGateway(message) {
    process.stdout.write(chalk.blue(` Event Gateway  |  ${message.trim()}\n`));
  }
}

module.exports = Run;
