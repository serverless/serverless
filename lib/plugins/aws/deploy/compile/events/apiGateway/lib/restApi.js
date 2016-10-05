'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compileRestApi() {
    const logicalApiGatewayName = this.sdk.naming.getLogicalApiGatewayName();
    const apiGatewayName = this.sdk.naming.getApiGatewayName();
    const restApiTemplate = `
      {
        "Type" : "AWS::ApiGateway::RestApi",
        "Properties" : {
          "Name" : "${apiGatewayName}"
        }
      }
    `;

    const newRestApiObject = {
      [logicalApiGatewayName]: JSON.parse(restApiTemplate),
    };

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
      newRestApiObject);

    return BbPromise.resolve();
  },
};
