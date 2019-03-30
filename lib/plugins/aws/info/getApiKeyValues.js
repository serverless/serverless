'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {
  getApiKeyValues() {
    const info = this.gatheredData.info;
    info.apiKeys = [];

    // check if the user has set api keys
    const apiKeyDefinitions = this.serverless.service.provider.apiKeys;
    const apiKeyNames = [];
    if (_.isArray(apiKeyDefinitions) && apiKeyDefinitions.length) {
      _.forEach(apiKeyDefinitions, (definition) => {
        // different API key types are nested in separate arrays
        if (_.isObject(definition)) {
          const keyTypeName = Object.keys(definition)[0];
          _.forEach(definition[keyTypeName], (keyName) => apiKeyNames.push(keyName));
        } else if (_.isString(definition)) {
          // plain strings are simple, non-nested API keys
          apiKeyNames.push(definition);
        }
      });
    }

    if (apiKeyNames.length) {
      return this.provider
        .request('CloudFormation',
          'describeStackResources',
        { StackName: this.provider.naming.getStackName(),
        })
        .then(({ StackResources }) => {
          const apiKeys = _(StackResources)
            .filter(({ ResourceType }) => ResourceType === 'AWS::ApiGateway::ApiKey')
            .map(({ PhysicalResourceId }) => PhysicalResourceId)
            .value();
          return Promise.all(
            _.map(apiKeys, apiKey => this.provider.request('APIGateway', 'getApiKey', {
              apiKey,
              includeValue: true,
            }))
          );
        })
        .then(apiKeys => {
          if (apiKeys && apiKeys.length) {
            // iterate over all apiKeys and push the API key info and update the info object
            apiKeys.forEach(apiKey => {
              const apiKeyInfo = {};
              apiKeyInfo.name = apiKey.name;
              apiKeyInfo.value = apiKey.value;
              info.apiKeys.push(apiKeyInfo);
            });
          }
          return BbPromise.resolve();
        });
    }
    return BbPromise.resolve();
  },
};
