'use strict';

const BbPromise = require('bluebird');
const { progress, style } = require('@serverless/utils/log');
const writeServiceOutputs = require('../../../cli/write-service-outputs');
const validate = require('../lib/validate');
const getStackInfo = require('./get-stack-info');
const getResourceCount = require('./get-resource-count');
const getApiKeyValues = require('./get-api-key-values');
const display = require('./display');
const { log } = require('@serverless/utils/log');

const mainProgress = progress.get('main');

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

      'deploy:deploy': async () =>
        BbPromise.bind(this).then(() => {
          return this.serverless.pluginManager.spawn('aws:info');
        }),

      'before:aws:info:validate': () => {
        const isDeployCommand = this.serverless.processedInput.commands.join(' ') === 'deploy';
        if (!isDeployCommand) return;
        mainProgress.notice('Retrieving CloudFormation stack', { isMainEvent: true });
      },
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

      'after:aws:info:gatherData': () => {
        if (this.gatheredData && this.gatheredData.info.resourceCount >= 450) {
          log.warning(
            `You have ${
              this.gatheredData.info.resourceCount
            } resources in your service. CloudFormation has a hard limit of 500 resources in a service. For advice on avoiding this limit, check out this link: ${style.link(
              'http://slss.io/2q2'
            )}.`
          );
        }
      },

      'finalize': () => {
        if (this.serverless.processedInput.commands.join(' ') !== 'info') return;
        writeServiceOutputs(this.serverless.serviceOutputs);
        writeServiceOutputs(this.serverless.servicePluginOutputs);
      },
    };
  }
}

module.exports = AwsInfo;
