'use strict';
const ServerlessError = require('../../../../classes/Error').ServerlessError;

module.exports = {
  'Fn::GetAtt': (plugin, resource, resourceName, parameters) => {
    switch (parameters[1]) {
      case 'Arn':
        return plugin.provider
          .request('Lambda', 'getFunction', {
            FunctionName: resource.PhysicalResourceId,
          })
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
