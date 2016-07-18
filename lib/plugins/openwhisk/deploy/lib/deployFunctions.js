'use strict';

const BbPromise = require('bluebird');
const openwhisk = require('openwhisk');

module.exports = {
  openWhiskClientFactory() {
    const creds = this.serverless.service.resources.openwhisk;
    return openwhisk({ api: creds.apihost, api_key: creds.auth });
  },

  deployFunctionHandler(functionHandler) {
    const ow = this.openWhiskClientFactory();
    return ow.actions.create(functionHandler).catch(err => {
      throw new this.serverless.classes.Error(
        `Failed to deploy function (${functionHandler.actionName}) due to error: ${err.message}`
      );
    });
  },

  deployFunctions() {
    this.serverless.cli.log('Deploying Functions...');
    const functions = this.serverless.service.resources.openwhisk.functions;
    return BbPromise.all(
      Object.keys(functions).map(f => this.deployFunctionHandler(functions[f]))
    );
  },
};
