'use strict';

const BbPromise = require('bluebird');
const ClientFactory = require('../../util/client_factory');

module.exports = {
  deployFunctionHandler(functionHandler) {
    return ClientFactory.fromWskProps().then(ow =>
      ow.actions.create(functionHandler).catch(err => {
        throw new this.serverless.classes.Error(
          `Failed to deploy function (${functionHandler.actionName}) due to error: ${err.message}`
        );
      })
    );
  },

  deployFunctions() {
    this.serverless.cli.log('Deploying Functions...');
    const actions = this.serverless.service.actions;
    return BbPromise.all(
      Object.keys(actions).map(a => this.deployFunctionHandler(actions[a]))
    );
  },
};
