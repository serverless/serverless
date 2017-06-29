'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');
const traverse = require('../../../../../../../utils/traverse');

module.exports = {
  mergeSharedApiGateway() {
    const restApiId = this.serverless.service.provider.apiGatewayRestApiId;

    if (!restApiId) {
      return BbPromise.resolve();
    }

    return BbPromise.bind(this)
      .then(this.replaceUsages)
      .then(this.removeOldRestApiResource);
  },

  replaceUsages() {
    const restApiId = this.serverless.service.provider.apiGatewayRestApiId;
    let cfTemplate = this.serverless.service.provider.compiledCloudFormationTemplate;
    const restApiLogicalId = this.provider.naming.getRestApiLogicalId();
    const newRestApiLogicalId = this.provider.findAllCfReferences(restApiId)[0].ref;

    traverse(cfTemplate, (property, propertyPath) => {
      // replace usage of old AWS::ApiGateway::RestApi resource
      if (property === restApiLogicalId) {
        const updatedCfTemplate = _.set(cfTemplate, propertyPath, newRestApiLogicalId);
        cfTemplate = updatedCfTemplate;
      }
      // replace usage of RootResourceId
      if (property === 'RootResourceId') {
        const pathToRestApiName = propertyPath;
        pathToRestApiName[pathToRestApiName.length - 1] = 0;
        const updatedCfTemplate = _.set(cfTemplate, pathToRestApiName, newRestApiLogicalId);

        cfTemplate = updatedCfTemplate;
      }
    });
  },

  removeOldRestApiResource() {
    const cfTemplate = this.serverless.service.provider.compiledCloudFormationTemplate;
    const restApiLogicalId = this.provider.naming.getRestApiLogicalId();

    if (cfTemplate.Resources[restApiLogicalId]) {
      delete cfTemplate.Resources[restApiLogicalId];
    }

    return BbPromise.resolve();
  },
};
