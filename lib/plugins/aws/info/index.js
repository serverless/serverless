'use strict';

const validate = require('../lib/validate');
const getStackInfo = require('./getStackInfo');
const getResourceCount = require('./getResourceCount');
const getApiKeyValues = require('./getApiKeyValues');
const display = require('./display');

class AwsInfo {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');
    this.options = options || {};
    Object.assign(this, validate, getStackInfo, getResourceCount, getApiKeyValues, display);

    this.commands = {
      aws: {
        type: 'entrypoint',
        commands: {
          info: {
            lifecycleEvents: [
              'validate',
              'gatherData',
              'displayServiceInfo',
              'displayApiKeys',
              'displayEndpoints',
              'displayFunctions',
              'displayLayers',
              'displayStackOutputs',
            ],
          },
        },
      },
    };

    this.hooks = {
      'info:info': async () => this.serverless.pluginManager.spawn('aws:info'),

      'deploy:deploy': async () => {
        if (this.options.noDeploy) return;
        await this.serverless.pluginManager.spawn('aws:info');
      },

      'aws:info:validate': async () => this.validate(),

      'aws:info:gatherData': async () => {
        await this.getStackInfo();
        await this.getResourceCount();
        await this.getApiKeyValues();
      },

      'aws:info:displayServiceInfo': async () => this.displayServiceInfo(),

      'aws:info:displayApiKeys': async () => this.displayApiKeys(),

      'aws:info:displayEndpoints': async () => this.displayEndpoints(),

      'aws:info:displayFunctions': async () => this.displayFunctions(),

      'aws:info:displayLayers': async () => this.displayLayers(),

      'aws:info:displayStackOutputs': async () => this.displayStackOutputs(),
    };
  }
}

module.exports = AwsInfo;
