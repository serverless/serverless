'use strict';

const BbPromise = require('bluebird');

module.exports = {
  createResourceGroup() {
    // Todo: Get resource group. If it exists... blow it away.

    return BbPromise.resolve();
  },
};
