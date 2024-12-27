'use strict';

const _ = require('lodash');
const ServerlessError = require('../../../../../../../serverless-error');

function createUsagePlanKeyResource(that, usagePlanLogicalId, dependency, keyNumber, keyName) {
  const apiKeyLogicalId = that.provider.naming.getApiKeyLogicalId(keyNumber, keyName);

  const resourceTemplate = {
    Type: 'AWS::ApiGateway::UsagePlanKey',
    DependsOn: dependency,
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
    const apiKeys = _.get(this.serverless.service.provider.apiGateway, 'apiKeys');
    if (apiKeys) {
      const resources = this.serverless.service.provider.compiledCloudFormationTemplate.Resources;
      let keyNumber = 0;
      let dependsOn = undefined;

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
            dependsOn ??= usagePlanLogicalId;
            const resourceTemplate = createUsagePlanKeyResource(
              this,
              usagePlanLogicalId,
              dependsOn,
              keyNumber,
              name
            );
            _.merge(resources, {
              [usagePlanKeyLogicalId]: resourceTemplate,
            });
            // make the UsagePlanKey depends on one by one, so it's running in sequence not in parallel
            dependsOn = usagePlanKeyLogicalId;
          });
        } else {
          keyNumber += 1;
          const usagePlanKeyLogicalId = this.provider.naming.getUsagePlanKeyLogicalId(keyNumber);
          const usagePlanLogicalId = this.provider.naming.getUsagePlanLogicalId();
          dependsOn ??= usagePlanLogicalId;
          const resourceTemplate = createUsagePlanKeyResource(this, usagePlanLogicalId, dependsOn, keyNumber);
          _.merge(resources, {
            [usagePlanKeyLogicalId]: resourceTemplate,
          });
          // make the UsagePlanKey depends on one by one, so it's running in sequence not in parallel
          dependsOn = usagePlanKeyLogicalId;
        }
      });
    }
  },
};
