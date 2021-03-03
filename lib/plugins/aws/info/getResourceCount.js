'use strict';

module.exports = {
  async getResourceCount(nextToken, resourceCount = 0) {
    const params = {
      StackName: this.provider.naming.getStackName(),
      NextToken: nextToken,
    };
    const result = await this.provider.request('CloudFormation', 'listStackResources', params);

    if (Object.keys(result).length) {
      this.gatheredData.info.resourceCount = resourceCount + result.StackResourceSummaries.length;
      if (result.NextToken) {
        await this.getResourceCount(result.NextToken, this.gatheredData.info.resourceCount);
      }
    }
  },
};
