'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {
  getResourceCount() {
    const stackName = this.provider.naming.getStackName();

    return this.provider.request('CloudFormation',
      'listStackResources',
      { StackName: stackName })
    .then(result => {
      if (!_.isEmpty(result)) {
        this.gatheredData.info.resourceCount = result.StackResourceSummaries.length;
      }
      return BbPromise.resolve();
    });
  },
};
