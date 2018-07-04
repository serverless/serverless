'use strict';

const BbPromise = require('bluebird');

const logServerless = require('./utils/logServerless');
const getLocalRootUrl = require('./utils/getLocalRootUrl');

const localEmulatorRunning = require('./utils/localEmulatorRunning');
const eventGatewayRunning = require('./utils/eventGatewayRunning');

const localEmulatorInstalled = require('./utils/localEmulatorInstalled');
const eventGatewayInstalled = require('./utils/eventGatewayInstalled');

const installLocalEmulator = require('./utils/installLocalEmulator');
const installEventGateway = require('./utils/installEventGateway');

const deployFunctionsToLocalEmulator = require('./utils/deployFunctionsToLocalEmulator');
const registerFunctionsToEventGateway = require('./utils/registerFunctionsToEventGateway');

const manageLocalEmulator = require('./utils/manageLocalEmulator');
const manageEventGateway = require('./utils/manageEventGateway');

const isLoggedIn = require('../../utils/isLoggedIn');

class Run {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.commands = {
      run: {
        usage: 'Runs the Event Gateway and the Emulator',
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
            shortcut: 'c',
            default: '4001',
          },
          lport: {
            usage: 'The Emulator port',
            shortcut: 'l',
            default: '4002',
          },
          debug: {
            usage: 'Start the debugger',
            shortcut: 'd',
          },
        },
        platform: true,
      },
    };

    this.hooks = {
      'run:run': () => BbPromise.bind(this)
        .then(this.run),
    };
  }

  run() {
    const EVENT_GATEWAY_VERSION = '0.5.15';
    const LOCAL_EMULATOR_VERSION = '0.1.18';

    if (!isLoggedIn()) {
      throw new this.serverless.classes
        .Error('Must be logged in to use this command. Please run "serverless login".');
    }

    let functionsDeployed = false;
    let functionsRegistered = false;
    if (!this.serverless.config.servicePath) {
      throw new this.serverless.classes
        .Error('This command can only run inside a service');
    }

    return localEmulatorRunning(getLocalRootUrl(this.options.lport))
      .then(localEmulatorAlreadyRunning => {
        if (localEmulatorAlreadyRunning) {
          // logServerless('Emulator already running');
          functionsDeployed = true;
          return deployFunctionsToLocalEmulator(
            this.serverless.service,
            this.serverless.config.servicePath,
            getLocalRootUrl(this.options.lport)
          ).then(noFunctions => {
            if (noFunctions) {
              // eslint-disable-next-line max-len
              logServerless('Service does not contain any functions to be loaded in your current "serverless run" session.');
              return BbPromise.resolve();
            }
            // eslint-disable-next-line max-len
            logServerless('Functions loaded successfully in your current "serverless run" session.');
            return BbPromise.resolve();
          });
        }
        return BbPromise.resolve();
      })
      .then(() => eventGatewayRunning(getLocalRootUrl(this.options.cport)))
      .then(eventGatewayAlreadyRunning => {
        if (eventGatewayAlreadyRunning) {
          functionsRegistered = true;
          // logServerless('Event Gateway already running');
          return registerFunctionsToEventGateway(
            this.serverless.service,
            getLocalRootUrl(this.options.eport),
            getLocalRootUrl(this.options.cport),
            getLocalRootUrl(this.options.lport)
          ).then(() => {
            // eslint-disable-next-line max-len
            // logServerless('Functions and subscriptions registered. For details please review the terminal running the Event Gateway.');
          });
        }
        return BbPromise.resolve();
      })
      .then(() => {
        if (!functionsDeployed && !localEmulatorInstalled(LOCAL_EMULATOR_VERSION)) {
          logServerless('Installing Emulator');
          installLocalEmulator(LOCAL_EMULATOR_VERSION);
        }
        return BbPromise.resolve();
      })
      .then(() => {
        if (!eventGatewayInstalled(EVENT_GATEWAY_VERSION)) {
          logServerless('Installing Event Gateway');
          return installEventGateway(EVENT_GATEWAY_VERSION);
        }
        return BbPromise.resolve();
      })
      .then(() => {
        if (!functionsDeployed) {
          return manageLocalEmulator(this.serverless.service,
            this.serverless.config.servicePath,
            { port: this.options.lport, debug: this.options.debug });
        }
        return BbPromise.resolve();
      })
      .then(() => {
        if (!functionsRegistered) {
          return manageEventGateway(this.serverless.service,
            this.options.eport,
            this.options.cport,
            this.options.lport);
        }
        return BbPromise.resolve();
      });
  }
}

module.exports = Run;
