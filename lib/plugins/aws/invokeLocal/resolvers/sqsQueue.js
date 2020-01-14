'use strict';
const aws = require('aws-sdk');

module.exports = {
  'Fn::GetAtt': (plugin, resource, resourceName, parameters, serviceConfig) => {
    const sqs = new aws.SQS(serviceConfig);
    switch (parameters[1]) {
      case 'Arn':
        return plugin.getCFResources(serviceConfig).then(cfData => {
          const cfResource = cfData.find(x => x.LogicalResourceId === resourceName);
          if (!cfResource) {
            throw new ServerlessError(`${resourceName} could not be found in the deployed stack`);
          }

          return sqs
            .getQueueAttributes({
              QueueUrl: cfResource.PhysicalResourceId,
              AttributeNames: ['QueueArn'],
            })
            .promise()
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
        throw new ServerlessError(`Could not resolve ${parameters[1]} on ${resourceName}`);
    }
  },
};
