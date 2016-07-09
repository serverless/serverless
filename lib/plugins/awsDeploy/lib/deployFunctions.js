'use strict';

const BbPromise = require('bluebird');
const forEach = require('lodash').forEach;

module.exports = {
  extractFunctionHandlers() {
    this.deployedFunctions = [];
    forEach(this.serverless.service.functions, (value, key) => {
      if (key !== 'name_template') {
        this.deployedFunctions.push({
          name: key,
          handler: value.handler,
        });
      }
    });

    return BbPromise.resolve();
  },

  deployFunctions() {
    return BbPromise.bind(this)
      .then(this.extractFunctionHandlers);
  },
};
