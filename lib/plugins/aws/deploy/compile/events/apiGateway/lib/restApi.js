'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compileRestApi() {
    this.apiGatewayRestApiLogicalId = this.provider.naming.getRestApiLogicalId();

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
      [this.apiGatewayRestApiLogicalId]: {
        Type: 'AWS::ApiGateway::RestApi',
        Properties: {
          Name: `${this.options.stage}-${this.serverless.service.service}`,
        },
      },
    });

    return BbPromise.resolve();
  },
};
