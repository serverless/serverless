'use strict';
const aws = require('aws-sdk');
const resolvers = require('.');

module.exports = {
  'Ref': resolvers.resolveResourceId,
  'Fn::GetAtt': (plugin, resource, resourceName, parameters, serviceConfig) => {
    const sqs = new aws.SQS(serviceConfig);
    switch (parameters[1]) {
      case 'Arn':
        return resolvers.getCFResources(serviceConfig).then(cfData => {
          const cfResource = cfData.find(x => x.LogicalResourceId === resourceName);
          if (!cfResource) {
            return parameters;
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
        return new Promise(resolve => {
          resolve(parameters);
        });
    }
  },
};
