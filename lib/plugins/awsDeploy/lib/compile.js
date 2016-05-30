'use strict';

const path = require('path');
const BbPromise = require('bluebird');
const forEach = require('lodash').forEach;

module.exports = {
  extractFunctions: function () {
    const rawFunctionObjects = this.serverless.service.functions;

    forEach(rawFunctionObjects, (value, key) => {
      // check if it's the function and not the name_template property
      if (key !== 'name_template') {
        const functionObject = {
          [key]: value,
        };

        this.functionObjects.push(functionObject);
      }
    });

    return BbPromise.resolve();
  },
};
