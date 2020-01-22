'use strict';
const ServerlessError = require('../../../../classes/Error').ServerlessError;

module.exports = {
  'Fn::GetAtt': (plugin, resource, resourceName, parameters) => {
    switch (parameters[1]) {
      case 'TopicName':
        return new Promise(resolve => {
          resolve(resource.PhysicalResourceId);
        });
      default:
        throw new ServerlessError(
          `The attribute ${parameters[1]} is not currently supported by the serverless framework`
        );
    }
  },
};
