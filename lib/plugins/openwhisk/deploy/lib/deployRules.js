'use strict';

const BbPromise = require('bluebird');
const openwhisk = require('openwhisk');

module.exports = {
  openWhiskClientFactory() {
    const creds = this.serverless.service.resources.openwhisk;
    return openwhisk({ api: creds.apihost, api_key: creds.auth });
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
    const functions = this.serverless.service.resources.openwhisk.functions;
    return BbPromise.all(this.findAllRules(functions).map(r => this.deployRule(r)));
  },
};
