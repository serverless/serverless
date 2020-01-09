'use strict';
const aws = require('aws-sdk');
const ServerlessError = require('../../../../classes/Error').ServerlessError;

module.exports = {
  'Ref': (plugin, resource) => {
    return new Promise(resolve => {
      resolve(resource.Properties.FunctionName);
    });
  },
  'Fn::GetAtt': (plugin, resource, resourceName, parameters, serviceConfig) => {
    let lambda;
    switch (parameters[1]) {
      case 'Arn':
        lambda = new aws.Lambda(serviceConfig);
        return lambda
          .getFunction({
            FunctionName: resource.Properties.FunctionName,
          })
          .promise()
          .then(func => {
            if (!func) {
              return parameters;
            }
            return func.Configuration.FunctionArn;
          });
      default:
        throw new ServerlessError(
          `Attribute (${parameters[1]}) for ${resource.Properties.FunctionName} not supported`
        );
    }
  },
};
