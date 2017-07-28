'use strict';
/*
 curl --request POST \
 --url http://127.0.0.1:8081/v1/functions \
 --header 'content-type: application/json' \
 --data '{"functionId": "hello", "provider":{"type": "http", "url": "http://localhost:8082/v0/emulator/api/functions/invoke"'
 */

const BbPromise = require('bluebird');
const _ = require('lodash');
const chalk = require('chalk');
const childProcess = BbPromise.promisifyAll(require('child_process'));
// const fdk = require('fdk'); // not published yet
const path = require('path');
const os = require('os');
const download = require('download');

const fileExistsSync = require('../../utils/fs/fileExistsSync');
const getLocalEmulatorFunctionConfig = require('./utils/getLocalEmulatorFunctionConfig');
const deployFunctionToLocalEmulator = require('./utils/deployFunctionToLocalEmulator');
const localEmulatorRunning = require('./utils/localEmulatorRunning');
const getLocalEmulatorRootUrl = require('./utils/getLocalEmulatorRootUrl');

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
          port: {
            usage: 'The Local Emulator port',
            shortcut: 'p',
            default: '8082',
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

    return localEmulatorRunning(getLocalEmulatorRootUrl(this.options.port))
      .then(localEmulatorAlreadyRunning => {
        if (localEmulatorAlreadyRunning) {
          this.logServerless('Local Emulator Already Running');
          functionsDeployed = true;
          return this.deployFunctionsToLocalEmulator();
        }
        return BbPromise.resolve();
      })
      // .then(() => this.eventGatewayRunning())
      // .then(eventGatewayAlreadyRunning => {
      //   if (eventGatewayAlreadyRunning) {
      //     functionsRegistered = true;
      //     this.logServerless('Event Gateway Already Running');
      //     return this.registerFunctionsToEventGateway();
      //   }
      //   return BbPromise.resolve();
      // })
      .then(() => {
        if (!this.localEmulatorInstalled()) {
          this.installLocalEmulator();
        }
        return BbPromise.resolve();
      })
      // .then(() => {
      //   if (!this.eventGatewayInstalled()) {
      //     return this.installEventGateway();
      //   }
      //   return BbPromise.resolve();
      // })
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
            const eventGatewayChildProcess = childProcess.spawn(eventGatewayBinaryFilePath, ['--dev']);

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
        serviceName, functionName, localEmulatorFunctionConfig);
      functionDeploymentPromises.push(deployFunctionToLocalEmulatorPromise);
    });

    return BbPromise.all(functionDeploymentPromises)
      .then(() => this.logServerless('Functions Deployed!'));
  }

  registerFunctionsToEventGateway() {
    this.logServerless('Registering Functions to the Event Gateway...');

    const gateway = fdk.createEventGatewayClient({
      host: 'localhost:3000', // which port?!
    });
    const functionsArray = [];
    const service = this.serverless.service;
    const serviceName = service.service;

    _.each(service.functions, (functionConfig,
                               functionName) => {
      const functionId = `${serviceName}-${functionName}`;
      const invokeFunctionUrl = `http://localhost:8080/v0/emulator/api/functions/invoke/${functionId}`

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

  localEmulatorInstalled() {
    const stdout = childProcess.execSync('npm list -g serverless-local-emulator');
    const stdoutString = new Buffer(stdout, 'base64').toString();
    return stdoutString.includes('serverless-local-emulator');
  }

  eventGatewayInstalled() {
    const eventGatewayBinaryFilePath = path
      .join(os.homedir(), '.serverless', 'event-gateway', 'event-gateway');
    return fileExistsSync(eventGatewayBinaryFilePath);
  }

  installLocalEmulator() {
    this.logServerless('Installing Local Emulator...');
    const stdout = childProcess.execSync('npm install -g serverless-local-emulator');
    const stdoutString = new Buffer(stdout, 'base64').toString();
    return stdoutString.includes('serverless-local-emulator');
  }

  installEventGateway() {
    this.logServerless('Installing the Event Gateway...');
    const eventGatewayDownloadUrl = 'https://github.com/serverless/event-gateway/releases/download/0.2.0/event-gateway_0.2.0_darwin_amd64.tar.gz';
    const eventGatewayDownloadPath = path.join(os.homedir(), '.serverless', 'event-gateway');

    return download(
      eventGatewayDownloadUrl,
      eventGatewayDownloadPath,
      { timeout: 30000, extract: true, strip: 1, mode: '755' }
    );
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
