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
              'displayServiceOutputs',
            ],
          },
        },
      },
    };

    this.hooks = {
      'info:info': async () => this.serverless.pluginManager.spawn('aws:info'),

      'deploy:deploy': async () =>
        BbPromise.bind(this).then(() => {
          return this.serverless.pluginManager.spawn('aws:info');
        }),

      'aws:info:validate': async () => BbPromise.bind(this).then(this.validate),

      'aws:info:gatherData': async () =>
        BbPromise.bind(this)
          .then(this.getStackInfo)
          .then(this.getResourceCount)
          .then(this.getApiKeyValues),

      'aws:info:displayServiceInfo': async () => BbPromise.bind(this).then(this.displayServiceInfo),

      'aws:info:displayApiKeys': async () => BbPromise.bind(this).then(this.displayApiKeys),

      'aws:info:displayEndpoints': async () => BbPromise.bind(this).then(this.displayEndpoints),

      'aws:info:displayFunctions': async () => BbPromise.bind(this).then(this.displayFunctions),

      'aws:info:displayLayers': async () => BbPromise.bind(this).then(this.displayLayers),

      'aws:info:displayStackOutputs': async () =>
        BbPromise.bind(this).then(this.displayStackOutputs),

      'aws:info:displayServiceOutputs': async () => await this.displayServiceOutputs(),
    };
  }
}

module.exports = AwsInfo;
