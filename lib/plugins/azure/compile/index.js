'use strict';

const HttpTrigger = require('./lib/httpTrigger');
const TimerTrigger = require('./lib/timerTrigger');

class AzureCompileFunctions {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = 'azure';

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
      throw new this.serverless.classes.Error(
        'This plugin needs access to the Resources section of the Azure Resource Manager template');
    }

    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObject = this.serverless.service.getFunction(functionName);
      let functionJSON = {};

      // Can only do this if we have an azure config.
      if (!functionObject.events.azure) {
        throw new this.serverless.classes.Error(
          `Function ${functionName} does not have an azure trigger configuration`
        );
      }

      // Identify the type of trigger to deploy.
      if (functionObject.events.azure.http) {
        functionJSON = HttpTrigger.buildFunctionJSON(functionObject);
      } else if (functionObject.events.azure.scheduled_trigger) {
        functionJSON = TimerTrigger.buildFunctionJSON(functionObject);
      }

      this.serverless.service.resources.azure.functions[functionName] = functionJSON;
    });
  }
}

module.exports = AzureCompileFunctions;
