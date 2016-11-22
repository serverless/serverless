'use strict';

const BbPromise = require('bluebird');

module.exports = {
  deleteFunctions(functions) {
    if (!functions.length) {
      return BbPromise.resolve();
    }

    this.serverless.cli
      .log('Deleting old functions…');

    const deleteFunctionPromises = [];

    functions.forEach((func) => {
      const params = {
        name: func.name,
      };

      deleteFunctionPromises.push(this.provider.request('functions', 'delete', params));
    });

    return BbPromise.all(deleteFunctionPromises);
  },
};
