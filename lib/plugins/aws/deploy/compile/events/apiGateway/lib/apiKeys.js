'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compileApiKeys() {
    if (typeof this.serverless.service.provider === 'object' &&
      this.serverless.service.provider.apiKeys) {
      this.serverless.service.provider.apiKeys.forEach((apiKey, index) => {
        if (typeof apikey !== 'string') {
          throw new this.serverless.classes.Error('API Keys must be strings');
        }

        const apiKeysTemplate = `
        {
          "Type" : "AWS::ApiGateway::ApiKey",
          "Properties" : {
            "Enabled" : true,
            "Name" : "${apiKey}",
            "StageKeys" : [{
              "RestApiId": { "Ref": "RestApiApigEvent" },
              "StageName": "${this.options.stage}"
            }]
          }
        }
        `;

        const newApiKeyObject = {
          [`ApiKeyApigEvent${index}`]: JSON.parse(apiKeysTemplate),
        };

        _.merge(this.serverless.service.resources.Resources, newApiKeyObject);
      });
    }

    return BbPromise.resolve();
  },
};
