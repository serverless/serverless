'use strict';

const BbPromise = require('bluebird');

const latestVersion = require('latest-version');

const getLocalRootUrl = require('./utils/getLocalRootUrl');
const registerFunctionsToEventGateway = require('./utils/registerFunctionsToEventGateway');
const deployFunctionsToLocalEmulator = require('./utils/deployFunctionsToLocalEmulator');

const manageLocalEmulator = require('./utils/manageLocalEmulator');
const manageEventGateway = require('./utils/manageEventGateway');

const localEmulatorRunning = require('./utils/localEmulatorRunning');
const eventGatewayRunning = require('./utils/eventGatewayRunning');

const localEmulatorInstalled = require('./utils/localEmulatorInstalled');
const eventGatewayInstalled = require('./utils/eventGatewayInstalled');

const installLocalEmulator = require('./utils/installLocalEmulator');
const installEventGateway = require('./utils/installEventGateway');
const getLatestEventGatewayVersion = require('./utils/getLatestEventGatewayVersion');
const logServerless = require('./utils/logServerless');

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
          logServerless('Local Emulator Already Running');
          functionsDeployed = true;
          return deployFunctionsToLocalEmulator(this.serverless.service,
            this.serverless.config.servicePath,
            getLocalRootUrl(this.options.lport));
        }
        return BbPromise.resolve();
      })
      .then(() => eventGatewayRunning(getLocalRootUrl(this.options.cport)))
      .then(eventGatewayAlreadyRunning => {
        if (eventGatewayAlreadyRunning) {
          functionsRegistered = true;
          logServerless('Event Gateway Already Running');
          return registerFunctionsToEventGateway(this.serverless.service,
            getLocalRootUrl(this.options.eport),
            getLocalRootUrl(this.options.cport),
            getLocalRootUrl(this.options.lport));
        }
        return BbPromise.resolve();
      })
      .then(() => latestVersion('@serverless/emulator'))
      .then(latestLocalEmulatorVersion => {
        if (!functionsDeployed && !localEmulatorInstalled(latestLocalEmulatorVersion)) {
          logServerless('Installing Local Emulator');
          installLocalEmulator();
        }
        return BbPromise.resolve();
      })
      .then(() => getLatestEventGatewayVersion())
      .then(latestEventGatewayVersion => {
        if (!eventGatewayInstalled(latestEventGatewayVersion)) {
          logServerless('Installing Event Gateway');
          return installEventGateway(latestEventGatewayVersion);
        }
        return BbPromise.resolve();
      })
      .then(() => {
        if (!functionsDeployed) {
          manageLocalEmulator(this.serverless.service,
            this.serverless.config.servicePath,
            this.options.lport);
        }

        if (!functionsRegistered) {
          manageEventGateway(this.serverless.service,
            this.options.eport,
            this.options.cport,
            this.options.lport);
        }
      });
  }
}

module.exports = Run;
