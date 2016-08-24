'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compileApiKeys() {
    if (this.serverless.service.provider.apiKeys) {
      if (this.serverless.service.provider.apiKeys.constructor !== Array) {
        throw new this.serverless.classes.Error('apiKeys property must be an array');
      }

      let apiKeyNumber = 0;
      this.serverless.service.provider.apiKeys.forEach(apiKey => {
        apiKeyNumber++;
        if (typeof apiKey !== 'string') {
          throw new this.serverless.classes.Error('API Keys must be strings');
        }

        const apiKeysTemplate = `
        {
          "Type" : "AWS::ApiGateway::ApiKey",
          "Properties" : {
            "Enabled" : true,
            "Name" : "${apiKey}",
            "StageKeys" : [{
              "RestApiId": { "Ref": "ApiGatewayRestApi" },
              "StageName": "${this.options.stage}"
            }]
          }
        }
        `;

        const newApiKeyObject = {
          [`ApiGatewayApiKey${apiKeyNumber}`]: JSON.parse(apiKeysTemplate),
        };

        _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
          newApiKeyObject);
      });
    }

    return BbPromise.resolve();
  },
};
