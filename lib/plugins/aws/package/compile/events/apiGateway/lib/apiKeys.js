'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

function createApiKeyResource(that, apiKey) {
  const name = _.isString(apiKey) ? apiKey : apiKey.name;
  const value = _.isObject(apiKey) && apiKey.value ? apiKey.value : undefined;
  const resourceTemplate = {
    Type: 'AWS::ApiGateway::ApiKey',
    Properties: {
      Enabled: true,
      Name: name,
      Value: value,
      StageKeys: [{
        RestApiId: that.provider.getApiGatewayRestApiId(),
        StageName: that.provider.getStage(),
      }],
    },
    DependsOn: that.apiGatewayDeploymentLogicalId,
  };

  return _.cloneDeep(resourceTemplate);
}

module.exports = {
  validateApiKeyInput(apiKey) {
    if (_.isObject(apiKey) && (!_.isNil(apiKey.name) || !_.isNil(apiKey.value))) {
      return true;
    } else if (!_.isString(apiKey)) {
      return false;
    }
    return true;
  },
  compileApiKeys() {
    if (this.serverless.service.provider.apiKeys) {
      if (!_.isArray(this.serverless.service.provider.apiKeys)) {
        throw new this.serverless.classes.Error('apiKeys property must be an array');
      }
      const resources = this.serverless.service.provider.compiledCloudFormationTemplate.Resources;
      let keyNumber = 0;
      _.forEach(this.serverless.service.provider.apiKeys, (apiKeyDefinition) => {
        // if multiple API key types are used
        if (_.isObject(apiKeyDefinition)) {
          keyNumber = 0;
          const name = Object.keys(apiKeyDefinition)[0];
          _.forEach(apiKeyDefinition[name], (key) => {
            if (!this.validateApiKeyInput(key)) {
              throw new this.serverless.classes.Error(
                'API Key must be a string or an object which contains name and/or value'
              );
            }
            keyNumber += 1;
            const apiKeyLogicalId = this.provider.naming
              .getApiKeyLogicalId(keyNumber, name);
            const resourceTemplate = createApiKeyResource(this, key);
            _.merge(resources, {
              [apiKeyLogicalId]: resourceTemplate,
            });
          });
        } else {
          keyNumber += 1;
          if (!this.validateApiKeyInput(apiKeyDefinition)) {
            throw new this.serverless.classes.Error(
              'API Key must be a string or an object which contains name and/or value'
            );
          }
          const apiKeyLogicalId = this.provider.naming
            .getApiKeyLogicalId(keyNumber);
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
