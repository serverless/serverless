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
      return this.provider.request('APIGateway',
        'getApiKeys',
        { includeValues: true }
      ).then((allApiKeys) => {
        const items = allApiKeys.items;
        if (items && items.length) {
          // filter out the API keys only created for this stack
          const filteredItems = items.filter((item) => _.includes(apiKeyNames, item.name));

          // iterate over all apiKeys and push the API key info and update the info object
          filteredItems.forEach((item) => {
            const apiKeyInfo = {};
            apiKeyInfo.name = item.name;
            apiKeyInfo.value = item.value;
            info.apiKeys.push(apiKeyInfo);
          });
        }
        return BbPromise.resolve();
      });
    }
    return BbPromise.resolve();
  },
};
