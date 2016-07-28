'use strict';

const BbPromise = require('bluebird');
const ClientFactory = require('../../util/client_factory');

module.exports = {
  removeRule(ruleName) {
    const onSuccess = ow => ow.rules.delete({ ruleName });
    const errMsgTemplate =
      `Failed to delete rule (${ruleName}) due to error:`;
    const onErr = err => BbPromise.reject(
      new this.serverless.classes.Error(`${errMsgTemplate}: ${err.message}`)
    );

    return ClientFactory.fromWskProps().then(onSuccess).catch(onErr);
  },

  removeRules() {
    this.serverless.cli.log('Removing Rules...');

    const allRules = this.serverless.service.getAllFunctions()
      .map(f => this.serverless.service.getFunction(f))
      .map(f => f.events || [])
      .map(f => f.map(i => Object.keys(i)[0]));

    return BbPromise.all(
      [].concat.apply([], allRules).map(r => this.removeRule(r))
    );
  },
};
