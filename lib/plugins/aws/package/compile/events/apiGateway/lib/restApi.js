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
      const validEndpointTypes = ['REGIONAL', 'EDGE'];
      endpointType = this.serverless.service.provider.endpointType;

      if (typeof endpointType !== 'string') {
        throw new this.serverless.classes.Error('endpointType must be a string');
      }


      if (!_.includes(validEndpointTypes, endpointType.toUpperCase())) {
        const message = 'endpointType must be one of "REGIONAL" or "EDGE". ' +
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

    return BbPromise.resolve();
  },
};
