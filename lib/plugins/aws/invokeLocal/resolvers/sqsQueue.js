'use strict';
const ServerlessError = require('../../../../classes/Error').ServerlessError;

module.exports = {
  'Fn::GetAtt': (plugin, resource, resourceName, parameters) => {
    switch (parameters[1]) {
      case 'Arn':
        return plugin.getCFResources().then(cfData => {
          const cfResource = cfData.find(x => x.LogicalResourceId === resourceName);
          if (!cfResource) {
            throw new ServerlessError(`${resourceName} could not be found in the deployed stack`);
          }

          return plugin.provider
            .request('SQS', 'getQueueAttributes', {
              QueueUrl: cfResource.PhysicalResourceId,
              AttributeNames: ['QueueArn'],
            })
            .then(attribs => {
              if (!attribs || !attribs.Attributes) {
                return parameters;
              }
              return attribs.Attributes.QueueArn;
            });
        });
      case 'QueueName':
        return new Promise(resolve => {
          resolve(resource.Properties.QueueName);
        });
      default:
        return new Promise(resolve => {
          resolve(parameters);
        });
    }
  },
};
