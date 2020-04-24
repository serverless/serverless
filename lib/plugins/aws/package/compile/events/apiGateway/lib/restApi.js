'use strict';

const _ = require('lodash');
const ServerlessError = require('../../../../../../../serverless-error');
const BbPromise = require('bluebird');

module.exports = {
  compileRestApi() {
    const apiGateway = this.serverless.service.provider.apiGateway || {};
    // immediately return if we're using an external REST API id
    if (apiGateway.restApiId) {
      return;
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
          throw new ServerlessError('VPC endpoint IDs are only available for private APIs');
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

    const resourcePolicy =
      _.get(this.serverless.service.provider.apiGateway, 'resourcePolicy') ||
      this.serverless.service.provider.resourcePolicy;
    if (resourcePolicy && Object.keys(resourcePolicy).length) {
      const policy = {
        Version: '2012-10-17',
        Statement: resourcePolicy,
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

    // Models are defined in the provider and can be used in http events later
    if (!_.isUndefined(apiGateway.schemas)) {
      const schemas = apiGateway.schemas;
      apiGateway.models = {};
      for (const schema of _.entries(schemas)) {
        const resourceName = schema[0];
        const resourceDefinition = schema[1];

        let name;
        let description;
        let definition;

        // If schema is not defined this will try to map resourceDefinition as the schema
        if (!resourceDefinition.schema) {
          definition = resourceDefinition;
        }
        else {
          definition = resourceDefinition.schema;
        }

        if (!resourceDefinition.name) {
          name = _.upperFirst(_.camelCase(resourceName));
        }
        else {
          name = _.upperFirst(_.camelCase(resourceDefinition.name));
        }

        const modelLogicalId = this.getModelLogicalId(name);
        const validatorLogicalId = `${  modelLogicalId}Validator`

        if (!resourceDefinition.description) {
          description = `Validation model for ${  name}`;
        }
        else {
          description = resourceDefinition.description;
        }

        apiGateway.models = apiGateway.models || {}
        apiGateway.models[resourceName] = {
          modelLogicalId,
          validatorLogicalId
        }

        _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
          [modelLogicalId]: {
            Type: 'AWS::ApiGateway::Model',
            Properties: {
              RestApiId: { Ref: this.apiGatewayRestApiLogicalId } ,
              Schema: definition,
              ContentType: 'application/json',
              Name: name,
              Description: description
            },
          },
          [validatorLogicalId]: {
            Type: 'AWS::ApiGateway::RequestValidator',
            Properties: {
              RestApiId: { Ref: this.apiGatewayRestApiLogicalId },
              ValidateRequestBody: true,
              ValidateRequestParameters: true,
              Name: `${name  }Validator`
            },
          },
        });

      }
    }

    return BbPromise.resolve();
  },

  getModelLogicalId(name) {
    if (!_.endsWith( name, 'Model')) {
      name += 'Model'
    }
    return name;
  }
};
