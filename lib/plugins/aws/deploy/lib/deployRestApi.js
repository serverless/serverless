'use strict';

const BbPromise = require('bluebird');

module.exports = {
  async deployRestApi(nextToken) {
      return this.provider
        .request('APIGateway', 'getRestApis', { NextToken: nextToken })
        .then((result) => {
          const restApiId = result?.items?.find(
            (api) => api.name === this.provider.naming.getApiGatewayName()
          )?.id;

          if (restApiId) {
            return this.provider.request('APIGateway', 'createDeployment', {
              stageName: this.provider.getStage(),
              restApiId,
            });
          }

          if (result.NextToken) {
            return this.deployRestApi(result.NextToken);
          }

          return BbPromise.resolve();
        });
    },
};
