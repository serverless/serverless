'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compileUsagePlanKeys() {
    if (this.serverless.service.provider.apiKeys) {
      if (!Array.isArray(this.serverless.service.provider.apiKeys)) {
        throw new this.serverless.classes.Error('apiKeys property must be an array');
      }

      _.forEach(this.serverless.service.provider.apiKeys, (apiKey, i) => {
        const usagePlanKeyNumber = i + 1;

        if (typeof apiKey !== 'string') {
          throw new this.serverless.classes.Error('API Keys must be strings');
        }

        const usagePlanKeyLogicalId = this.provider.naming
          .getUsagePlanKeyLogicalId(usagePlanKeyNumber);

        const apiKeyLogicalId = this.provider.naming
          .getApiKeyLogicalId(usagePlanKeyNumber);

        _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
          [usagePlanKeyLogicalId]: {
            Type: 'AWS::ApiGateway::UsagePlanKey',
            Properties: {
              KeyId: {
                Ref: apiKeyLogicalId,
              },
              KeyType: 'API_KEY',
              UsagePlanId: {
                Ref: this.apiGatewayUsagePlanLogicalId,
              },
            },
          },
        });
      });
    }
    return BbPromise.resolve();
  },
};
