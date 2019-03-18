'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compileRestApi() {
    if (this.serverless.service.provider.apiGateway &&
      this.serverless.service.provider.apiGateway.restApiId) {
      return BbPromise.resolve();
    }

    this.apiGatewayRestApiLogicalId = this.provider.naming.getRestApiLogicalId();

    let endpointType = 'EDGE';

    if (this.serverless.service.provider.endpointType) {
      const validEndpointTypes = ['REGIONAL', 'EDGE', 'PRIVATE'];
      endpointType = this.serverless.service.provider.endpointType;

      if (typeof endpointType !== 'string') {
        throw new this.serverless.classes.Error('endpointType must be a string');
      }


      if (!_.includes(validEndpointTypes, endpointType.toUpperCase())) {
        const message = 'endpointType must be one of "REGIONAL" or "EDGE" or "PRIVATE". ' +
                        `You provided ${endpointType}.`;
        throw new this.serverless.classes.Error(message);
      }
      endpointType = endpointType.toUpperCase();
    }

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
      [this.apiGatewayRestApiLogicalId]: {
        Type: 'AWS::ApiGateway::RestApi',
        Properties: {
          Name: this.provider.naming.getApiGatewayName(),
          EndpointConfiguration: {
            Types: [endpointType],
          },
        },
      },
    });

    if (!_.isEmpty(this.serverless.service.provider.resourcePolicy)) {
      const policy = {
        Version: '2012-10-17',
        Statement: this.serverless.service.provider.resourcePolicy,
      };
      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[this.apiGatewayRestApiLogicalId].Properties, {
            Policy: policy,
          });
    }

    if (!_.isEmpty(this.serverless.service.provider.apiGateway) &&
      !_.isEmpty(this.serverless.service.provider.apiGateway.apiKeySourceType)) {
      const apiKeySourceType =
        this.serverless.service.provider.apiGateway.apiKeySourceType.toUpperCase();
      const validApiKeySourceType = ['HEADER', 'AUTHORIZER'];

      if (!_.includes(validApiKeySourceType, apiKeySourceType)) {
        const message =
          'apiKeySourceType must be one of "HEADER" or "AUTHORIZER". ' +
          `You provided ${apiKeySourceType}.`;
        return BbPromise.reject(new this.serverless.classes.Error(message));
      }

      _.merge(
        this.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[this.apiGatewayRestApiLogicalId].Properties,
        { ApiKeySourceType: apiKeySourceType }
      );
    }

    if (!_.isEmpty(this.serverless.service.provider.apiGateway) &&
      !_.isUndefined(this.serverless.service.provider.apiGateway.minimumCompressionSize)) {
      const minimumCompressionSize =
        this.serverless.service.provider.apiGateway.minimumCompressionSize;

      if (!_.isInteger(minimumCompressionSize)) {
        const message =
          'minimumCompressionSize must be an integer. ' +
          `You provided ${JSON.stringify(minimumCompressionSize)}.`;
        return BbPromise.reject(new this.serverless.classes.Error(message));
      }

      if (minimumCompressionSize < 0 || minimumCompressionSize > 10485760) {
        const message =
          'minimumCompressionSize must be between 0 and 10485760. ' +
          `You provided ${minimumCompressionSize}.`;
        return BbPromise.reject(new this.serverless.classes.Error(message));
      }

      _.merge(
        this.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[this.apiGatewayRestApiLogicalId].Properties,
        { MinimumCompressionSize: minimumCompressionSize }
      );
    }

    return BbPromise.resolve();
  },
};
