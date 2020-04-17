'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {
  getResourceCount(nextToken, resourceCount = 0) {
    const params = {
      StackName: this.provider.naming.getStackName(),
      NextToken: nextToken,
    };
    return this.provider.request('CloudFormation', 'listStackResources', params).then(result => {
      if (!_.isEmpty(result)) {
        this.gatheredData.info.resourceCount = resourceCount + result.StackResourceSummaries.length;
        if (result.NextToken) {
          return this.getResourceCount(result.NextToken, this.gatheredData.info.resourceCount);
        }
      }
      return BbPromise.resolve();
    });
  },
};
