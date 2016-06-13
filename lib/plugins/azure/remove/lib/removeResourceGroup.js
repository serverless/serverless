'use strict';

const BbPromise = require('bluebird');

module.exports = {
  remove() {
    this.serverless.cli.log('Removing Stack...');

    const resourceGroup = `${this.serverless.service.service}-${this.options.stage}`;

    const params = {
      resourceGroup: resourceGroup,
    };

    // Todo: Return promise kicking off the deletion, then pass on an identifier
    // and a check frequency to the monitorRemove() below
  },

  monitorRemove(resourceGroup, frequency) {
    return new BbPromise((resolve) => {
      // Todo: Check if deletion has completed
    });
  },

  removeResourceGroup() {
    return BbPromise.bind(this)
      .then(this.remove)
      .then(this.monitorRemove);
  },
};
