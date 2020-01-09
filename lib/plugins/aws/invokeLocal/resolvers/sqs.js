'use strict';
const aws = require('aws-sdk');
const resolvers = require('.');

module.exports = {
    Ref: resolvers.resolveResourceId,
    'Fn::GetAtt': async (plugin, resource, resourceName, parameters, serviceConfig) => {
        let cfResource;
        let attribs;
        const sqs = new aws.SQS(serviceConfig);
        switch(parameters[1]) {
            case 'Arn':
                cfResource = (await resolvers.getCFResources(serviceConfig))
                                        .find(x => x.LogicalResourceId === resourceName);
                if(!cfResource) {
                    return parameters;
                }
                
                attribs = await sqs.getQueueAttributes({
                    QueueUrl: cfResource.PhysicalResourceId,
                    AttributeNames: ['QueueArn']
                }).promise();
                if(!attribs || !attribs.Attributes) {
                    return parameters;
                }
                return attribs.Attributes.QueueArn;
            case 'QueueName':
                return resource.Properties.QueueName;
            default:
                return parameters;
        }
    }
}
