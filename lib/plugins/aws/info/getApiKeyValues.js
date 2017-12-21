'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {
  getApiKeyValues() {
    const info = this.gatheredData.info;
    info.apiKeys = [];

    // check if the user has set api keys
    const apiKeyNames = this.serverless.service.provider.apiKeys || [];

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
