'use strict';

const BbPromise = require('bluebird');
const chalk = require('chalk');
const path = require('path');
const fetch = require('node-fetch');

fetch.Promise = BbPromise;

class AzureInvoke {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.hooks = {
      'invoke:invoke': () =>
        BbPromise.bind(this)
          .then(this.validate)
          .then(this.invoke)
          .then(this.log),
    };
  }

  validate() {
    if (!this.serverless.config.servicePath) {
      throw new this.serverless.classes.Error('This command can only be run inside a service.');
    }

    // validate stage/region/function exists in service
    const convertedRegion = this.serverless.utils.convertRegionName(this.options.region);
    this.serverless.service.getStage(this.options.stage);
    this.serverless.service.getRegionInStage(this.options.stage, convertedRegion);
    this.serverless.service.getFunction(this.options.function);

    if (this.options.path) {
      if (!this.serverless.utils
          .fileExistsSync(path.join(this.serverless.config.servicePath, this.options.path))) {
        throw new this.serverless.classes.Error('The file path you provided does not exist.');
      }

      this.options.data = this.serverless.utils
        .readFileSync(path.join(this.serverless.config.servicePath, this.options.path));
    }

    // Ensure username & password
    const user = process.env.AZURE_USERNAME;
    const pass = process.env.AZURE_PASSWORD;

    if (!user || !pass) {
      throw new this.serverless.classes.Error(
        'Environment variables AZURE_PASSWORD and AZURE_USERNAME not found'
      );
    }

    return BbPromise.resolve();
  }

  invoke() {
    const url = `https://${process.env.AZURE_USERNAME}:${process.env.AZURE_PASSWORD}
      @serverless-${this.serverless.service.service}-${this.options.stage}
      .azurewebsites.net/api/functions`;

    return fetch(url)
      .then(res =>
        fetch(res.json().properties.trigger_url)
          .then(triggerResponse => triggerResponse.json())
      );
  }

  log(invocationReply) {
    console.log(chalk.white(invocationReply)); // eslint-disable-line no-console
  }
}

module.exports = AzureInvoke;
