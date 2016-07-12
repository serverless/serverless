'use strict';

const BbPromise = require('bluebird');
const ClientFactory = require('../../util/client_factory');

module.exports = {
  removeFunctionHandler(functionHandler) {
    return ClientFactory.fromWskProps().then(ow => {
      return ow.actions.delete(functionHandler).catch(err => {
        throw new this.serverless.classes.Error(
          `Failed to delete function service (${functionHandler.actionName}) due to error: ${err.message}`
        )
      });
    });
  },

  removeFunction(functionName) {
    const functionObject = this.serverless.service.getFunction(functionName);
    const FunctionHandler = {};

    FunctionHandler.actionName = functionObject.name 
      || `${this.serverless.service.service}_${functionName}`;

    if (functionObject.namespace) { 
      FunctionHandler.namespace = functionObject.namespace;
    }

    return this.removeFunctionHandler(FunctionHandler);
  },

  remove() {
    this.serverless.cli.log('Removing Functions...');

    return BbPromise.all(
      this.serverless.service.getAllFunctions().map(f => this.removeFunction(f))
    );
  }
};
