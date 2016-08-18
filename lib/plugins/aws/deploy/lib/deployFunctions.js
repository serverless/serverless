'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {
  extractFunctionHandlers() {
    this.deployedFunctions = [];
    _.forEach(this.serverless.service.functions, (value, key) => {
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
