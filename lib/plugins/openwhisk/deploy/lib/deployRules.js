'use strict';

const BbPromise = require('bluebird');
const openwhisk = require('openwhisk');

module.exports = {
  openWhiskClientFactory() {
    const defaults = this.serverless.service.defaults;
    return openwhisk({ api: defaults.apihost, api_key: defaults.auth });
  },

  findAllRules (functions) {
    const allRules = Object.keys(functions).reduce((list, f) => {
      const functionRules = functions[f].rules; 
      Object.keys(functionRules).forEach(r => list.push(functionRules[r]));
      return list
    }, []);
    return allRules;
  },

  deployRule(rule) {
    const ow = this.openWhiskClientFactory();
    return ow.rules.create(rule).catch(err => {
      throw new this.serverless.classes.Error(
        `Failed to deploy rule (${rule.ruleName}) due to error: ${err.message}`
      );
    });
  },

  deployRules() {
    this.serverless.cli.log('Deploying Rules...');
    const actions = this.serverless.service.actions;
    return BbPromise.all(this.findAllRules(actions).map(r => this.deployRule(r)));
  },
};
