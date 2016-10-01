'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');
const pathLib = require('path');

const naming = require(pathLib.join(__dirname, '..', '..', '..', '..', '..', 'lib', 'naming.js'));

module.exports = {
  compileRestApi() {
    const logicalApiGatewayName = naming.getLogicalApiGatewayName();
    const apiGatewayName = naming.getApiGatewayName();
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
