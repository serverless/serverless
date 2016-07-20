'use strict';

const BbPromise = require('bluebird');
const ClientFactory = require('../../util/client_factory');

module.exports = {
  removeFunctionHandler(functionHandler) {
    const onSucess = ow => ow.actions.delete(functionHandler);
    const errMsgTemplate =
      `Failed to delete function service (${functionHandler.actionName}) due to error:`;
    const onErr = err => BbPromise.reject(
      new this.serverless.classes.Error(`${errMsgTemplate}: ${err.message}`)
    );

    return ClientFactory.fromWskProps().then(onSucess).catch(onErr);
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

  removeFunctions() {
    this.serverless.cli.log('Removing Functions...');

    return BbPromise.all(
      this.serverless.service.getAllFunctions().map(f => this.removeFunction(f))
    );
  },
};
