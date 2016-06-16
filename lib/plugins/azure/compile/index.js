'use strict';

const BbPromise = require('bluebird');
const merge = require('lodash').merge;
const HttpTrigger = require('./lib/httpTrigger');

class AzureCompileFunctions {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.hooks = {
      'before:deploy:compileFunctions': this.setup.bind(this),
      'deploy:compileFunctions': this.compileFunctions.bind(this),
    };
  }

  setup() {
    // We'll keep the function JSON around in a map to be written to the
    // function folder as a 'function.json' file before deploying.
    this.serverless.service.resources.azure.functions = {};
  }

  compileFunctions() {
    if (!this.serverless.service.resources.azure.functions) {
      throw new this.serverless.Error(
        'This plugin needs access to the Resources section of the Azure Resource Manager template');
    }

    this.serverless.service.getAllFunctions().forEach((functionName) => {
      // TODO: make this work for other trigger types besides Http
      const functionObject = this.serverless.service.getFunction(functionName);
      const functionJSON = HttpTrigger.buildFunctionJSON(functionObject);

      this.serverless.service.resources.azure.functions[functionName] = functionJSON;
    });
  }
}

module.exports = AzureCompileFunctions;
