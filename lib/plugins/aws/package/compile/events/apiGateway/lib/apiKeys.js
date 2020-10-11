'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

function createApiKeyResource(that, apiKey) {
  const name = typeof apiKey === 'string' ? apiKey : apiKey.name;
  const value = _.isObject(apiKey) && apiKey.value ? apiKey.value : undefined;
  const description = _.isObject(apiKey) ? apiKey.description : undefined;
  const customerId = _.isObject(apiKey) ? apiKey.customerId : undefined;
  const resourceTemplate = {
    Type: 'AWS::ApiGateway::ApiKey',
    Properties: {
      Enabled: true,
      Name: name,
      Value: value,
      Description: description,
      CustomerId: customerId,
      StageKeys: [
        {
          RestApiId: that.provider.getApiGatewayRestApiId(),
          StageName: that.provider.getStage(),
        },
      ],
    },
    DependsOn: that.apiGatewayDeploymentLogicalId,
  };

  return _.cloneDeep(resourceTemplate);
}

module.exports = {
  compileApiKeys() {
    if (this.serverless.service.provider.apiKeys) {
      const resources = this.serverless.service.provider.compiledCloudFormationTemplate.Resources;
      let keyNumber = 0;
      this.serverless.service.provider.apiKeys.forEach(apiKeyDefinition => {
        // if multiple API key types are used
        const name = Object.keys(apiKeyDefinition)[0];
        if (
          _.isObject(apiKeyDefinition) &&
          Array.isArray(this.serverless.service.provider.usagePlan) &&
          _.flatten(
            this.serverless.service.provider.usagePlan.map(item => Object.keys(item))
          ).includes(name)
        ) {
          keyNumber = 0;
          apiKeyDefinition[name].forEach(key => {
            keyNumber += 1;
            const apiKeyLogicalId = this.provider.naming.getApiKeyLogicalId(keyNumber, name);
            const resourceTemplate = createApiKeyResource(this, key);
            _.merge(resources, {
              [apiKeyLogicalId]: resourceTemplate,
            });
          });
        } else {
          keyNumber += 1;
          const apiKeyLogicalId = this.provider.naming.getApiKeyLogicalId(keyNumber);
          const resourceTemplate = createApiKeyResource(this, apiKeyDefinition);
          _.merge(resources, {
            [apiKeyLogicalId]: resourceTemplate,
          });
        }
      });
    }
    return BbPromise.resolve();
  },
};
