'use strict';
const ServerlessError = require('../../../../classes/Error').ServerlessError;

module.exports = {
  'Fn::GetAtt': (plugin, resource, resourceName, parameters) => {
    switch (parameters[1]) {
      case 'Arn':
        return new Promise(resolve => {
          resolve(`arn:aws:s3:::${resource.PhysicalResourceId}`);
        });
      case 'DomainName':
        return new Promise(resolve => {
          resolve(`${resource.PhysicalResourceId}.s3.amazonaws.com`);
        });
      default:
        throw new ServerlessError(
          `The attribute ${parameters[1]} you are currently trying to resolve is not supported by the serverless framework`
        );
    }
  },
};
