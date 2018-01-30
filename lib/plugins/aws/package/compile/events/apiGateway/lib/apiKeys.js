'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compileApiKeys() {
    if (this.serverless.service.provider.apiKeys) {
      if (!Array.isArray(this.serverless.service.provider.apiKeys)) {
        throw new this.serverless.classes.Error('apiKeys property must be an array');
      }

      _.forEach(this.serverless.service.provider.apiKeys, (apiKey, i) => {
        const apiKeyNumber = i + 1;

        if (typeof apiKey !== 'string') {
          throw new this.serverless.classes.Error('API Keys must be strings');
        }

        const apiKeyLogicalId = this.provider.naming
          .getApiKeyLogicalId(apiKeyNumber);

        _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
          [apiKeyLogicalId]: {
            Type: 'AWS::ApiGateway::ApiKey',
            Properties: {
              Enabled: true,
              Name: apiKey,
              StageKeys: [{
                RestApiId: this.provider.getApiGatewayRestApiId(),
                StageName: this.provider.getStage(),
              }],
            },
            DependsOn: this.apiGatewayDeploymentLogicalId,
          },
        });
      });
    }
    return BbPromise.resolve();
  },
};
