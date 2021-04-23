'use strict';

const _ = require('lodash');
const ServerlessError = require('../../../../../../../serverless-error');

function createUsagePlanKeyResource(that, usagePlanLogicalId, keyNumber, keyName) {
  const apiKeyLogicalId = that.provider.naming.getApiKeyLogicalId(keyNumber, keyName);

  const resourceTemplate = {
    Type: 'AWS::ApiGateway::UsagePlanKey',
    Properties: {
      KeyId: {
        Ref: apiKeyLogicalId,
      },
      KeyType: 'API_KEY',
      UsagePlanId: {
        Ref: usagePlanLogicalId,
      },
    },
  };

  return _.cloneDeep(resourceTemplate);
}

module.exports = {
  compileUsagePlanKeys() {
    const apiKeys =
      _.get(this.serverless.service.provider.apiGateway, 'apiKeys') ||
      this.serverless.service.provider.apiKeys;
    if (apiKeys) {
      const resources = this.serverless.service.provider.compiledCloudFormationTemplate.Resources;
      let keyNumber = 0;

      apiKeys.forEach((apiKeyDefinition) => {
        // if multiple API key types are used
        const apiKey = Object.entries(apiKeyDefinition)[0];
        const name = apiKey[0];
        const value = _.last(apiKey);
        const usagePlansIncludeName = this.apiGatewayUsagePlanNames.includes(name);
        if (
          this.apiGatewayUsagePlanNames.length > 0 &&
          !usagePlansIncludeName &&
          _.isObject(value)
        ) {
          throw new ServerlessError(
            `API key "${name}" has no usage plan defined`,
            'API_GATEWAY_KEY_WITHOUT_USAGE_PLAN'
          );
        }
        if (_.isObject(apiKeyDefinition) && usagePlansIncludeName) {
          keyNumber = 0;
          apiKeyDefinition[name].forEach(() => {
            keyNumber += 1;
            const usagePlanKeyLogicalId = this.provider.naming.getUsagePlanKeyLogicalId(
              keyNumber,
              name
            );
            const usagePlanLogicalId = this.provider.naming.getUsagePlanLogicalId(name);
            const resourceTemplate = createUsagePlanKeyResource(
              this,
              usagePlanLogicalId,
              keyNumber,
              name
            );
            _.merge(resources, {
              [usagePlanKeyLogicalId]: resourceTemplate,
            });
          });
        } else {
          keyNumber += 1;
          const usagePlanKeyLogicalId = this.provider.naming.getUsagePlanKeyLogicalId(keyNumber);
          const usagePlanLogicalId = this.provider.naming.getUsagePlanLogicalId();
          const resourceTemplate = createUsagePlanKeyResource(this, usagePlanLogicalId, keyNumber);
          _.merge(resources, {
            [usagePlanKeyLogicalId]: resourceTemplate,
          });
        }
      });
    }
  },
};
