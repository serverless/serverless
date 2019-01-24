'use strict';

const BbPromise = require('bluebird');
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
    Object.assign(
      this,
      validate,
      getStackInfo,
      getResourceCount,
      getApiKeyValues,
      display
    );

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
      'info:info': () => this.serverless.pluginManager.spawn('aws:info'),

      'deploy:deploy': () => BbPromise.bind(this)
        .then(() => {
          if (this.options.noDeploy) {
            return BbPromise.resolve();
          }
          return this.serverless.pluginManager.spawn('aws:info');
        }),

      'aws:info:validate': () => BbPromise.bind(this)
        .then(this.validate),

      'aws:info:gatherData': () => BbPromise.bind(this)
        .then(this.getStackInfo)
        .then(this.getResourceCount)
        .then(this.getApiKeyValues),

      'aws:info:displayServiceInfo': () => BbPromise.bind(this)
        .then(this.displayServiceInfo),

      'aws:info:displayApiKeys': () => BbPromise.bind(this)
        .then(this.displayApiKeys),

      'aws:info:displayEndpoints': () => BbPromise.bind(this)
        .then(this.displayEndpoints),

      'aws:info:displayFunctions': () => BbPromise.bind(this)
        .then(this.displayFunctions),

      'aws:info:displayLayers': () => BbPromise.bind(this)
        .then(this.displayLayers),

      'aws:info:displayStackOutputs': () => BbPromise.bind(this)
        .then(this.displayStackOutputs),
    };
  }
}

module.exports = AwsInfo;
