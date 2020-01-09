'use strict';
const aws = require('aws-sdk');
const ServerlessError = require('../../../../classes/Error').ServerlessError;

module.exports = {
  'Ref': (plugin, resource) => {
    return resource.Properties.FunctionName;
  },
  'Fn::GetAtt': async (plugin, resource, resourceName, parameters, serviceConfig) => {
    let lambda;
    let func;
    switch (parameters[1]) {
      case 'Arn':
        lambda = new aws.Lambda(serviceConfig);
        func = await lambda
          .getFunction({
            FunctionName: resource.Properties.FunctionName,
          })
          .promise();
        if (!func) {
          return parameters;
        }
        return func.Configuration.FunctionArn;
      default:
        throw new ServerlessError(
          `Attribute (${parameters[1]}) for ${resource.Properties.FunctionName} not supported`
        );
    }
  },
};
