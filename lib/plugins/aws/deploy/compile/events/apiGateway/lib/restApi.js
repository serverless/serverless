'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compileRestApi() {
    this.restApiLogicalId = 'ApiGatewayRestApi';

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
      [this.restApiLogicalId]: {
        Type: 'AWS::ApiGateway::RestApi',
        Properties: {
          Name: `${this.options.stage}-${this.serverless.service.service}`,
        },
      },
    });
    return BbPromise.resolve();
  },
};
