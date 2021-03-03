'use strict';

const _ = require('lodash');

module.exports = {
  async getApiKeyValues() {
    const info = this.gatheredData.info;
    info.apiKeys = [];

    // check if the user has set api keys
    const apiKeyDefinitions =
      _.get(this.serverless.service.provider.apiGateway, 'apiKeys') ||
      this.serverless.service.provider.apiKeys;
    const apiKeyNames = [];
    if (Array.isArray(apiKeyDefinitions) && apiKeyDefinitions.length) {
      apiKeyDefinitions.forEach((definition) => {
        // different API key types are nested in separate arrays
        if (_.isObject(definition)) {
          const keyTypeName = Object.keys(definition)[0];
          if (Array.isArray(definition[keyTypeName])) {
            definition[keyTypeName].forEach((keyName) => apiKeyNames.push(keyName));
          } else if (definition.name) {
            apiKeyNames.push(definition.name);
          }
        } else if (typeof definition === 'string') {
          // plain strings are simple, non-nested API keys
          apiKeyNames.push(definition);
        }
      });
    }

    if (apiKeyNames.length) {
      const resources = await this.provider.request('CloudFormation', 'describeStackResources', {
        StackName: this.provider.naming.getStackName(),
      });

      const apiKeys = await Promise.all(
        (resources.StackResources || [])
          .filter((resource) => resource.ResourceType === 'AWS::ApiGateway::ApiKey')
          .map((resource) => resource.PhysicalResourceId)
          .map((apiKey) =>
            this.provider.request('APIGateway', 'getApiKey', {
              apiKey,
              includeValue: true,
            })
          )
      );

      if (apiKeys && apiKeys.length) {
        info.apiKeys = apiKeys.map((apiKey) =>
          _.pick(apiKey, ['name', 'value', 'description', 'customerId'])
        );
      }
    }
  },
};
