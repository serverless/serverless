'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compileRestApi() {
    const apiGateway = this.serverless.service.provider.apiGateway || {};

    // immediately return if we're using an external REST API id
    if (apiGateway.restApiId) {
      return BbPromise.resolve();
    }

    this.apiGatewayRestApiLogicalId = this.provider.naming.getRestApiLogicalId();

    let endpointType = 'EDGE';
    let vpcEndpointIds;
    let BinaryMediaTypes;
    if (apiGateway.binaryMediaTypes) {
      BinaryMediaTypes = apiGateway.binaryMediaTypes;
    }

    if (this.serverless.service.provider.endpointType) {
      endpointType = this.serverless.service.provider.endpointType.toUpperCase();

      if (this.serverless.service.provider.vpcEndpointIds) {
        vpcEndpointIds = this.serverless.service.provider.vpcEndpointIds;

        if (endpointType !== 'PRIVATE') {
          throw new this.serverless.classes.Error(
            'VPC endpoint IDs are only available for private APIs'
          );
        }
      }
    }

    const EndpointConfiguration = {
      Types: [endpointType],
    };

    if (vpcEndpointIds) {
      EndpointConfiguration.VpcEndpointIds = vpcEndpointIds;
    }

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
      [this.apiGatewayRestApiLogicalId]: {
        Type: 'AWS::ApiGateway::RestApi',
        Properties: {
          Name: this.provider.naming.getApiGatewayName(),
          BinaryMediaTypes,
          EndpointConfiguration,
        },
      },
    });

    if (
      this.serverless.service.provider.resourcePolicy &&
      Object.keys(this.serverless.service.provider.resourcePolicy).length
    ) {
      const policy = {
        Version: '2012-10-17',
        Statement: this.serverless.service.provider.resourcePolicy,
      };
      _.merge(
        this.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          this.apiGatewayRestApiLogicalId
        ].Properties,
        {
          Policy: policy,
        }
      );
    } else {
      // setting up a policy with no restrictions in cases where no policy is specified
      // this ensures that a policy is always present
      _.merge(
        this.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          this.apiGatewayRestApiLogicalId
        ].Properties,
        { Policy: '' }
      );
    }

    if (apiGateway.apiKeySourceType) {
      const apiKeySourceType = apiGateway.apiKeySourceType.toUpperCase();

      _.merge(
        this.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          this.apiGatewayRestApiLogicalId
        ].Properties,
        { ApiKeySourceType: apiKeySourceType }
      );
    }

    if (apiGateway.minimumCompressionSize) {
      const minimumCompressionSize = apiGateway.minimumCompressionSize;

      _.merge(
        this.serverless.service.provider.compiledCloudFormationTemplate.Resources[
          this.apiGatewayRestApiLogicalId
        ].Properties,
        { MinimumCompressionSize: minimumCompressionSize }
      );
    }

    return BbPromise.resolve();
  },
};
