'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compileRestApi() {
    if (this.serverless.service.provider.apiGatewayRestApiId) {
      return BbPromise.resolve();
      // fetch all apig resources
      // fetch all cf stack
      //
      // if apig resource does not exist => add
      // if apig resource exists
      //   if cf resource exists => add
      //   if cf resource does not exists => dont add
    }
    this.apiGatewayRestApiLogicalId = this.provider.naming.getRestApiLogicalId();

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
      [this.apiGatewayRestApiLogicalId]: {
        Type: 'AWS::ApiGateway::RestApi',
        Properties: {
          Name: this.provider.naming.getApiGatewayName(),
        },
      },
    });

    return BbPromise.resolve();
  },
};
