const aws = require('aws-sdk');
const resolvers = require('.');

module.exports = {
    Ref: resolvers.resolveResourceId,
    'Fn::GetAtt': async (plugin, resource, resourceName, parameters, serviceConfig) => {
        switch(parameters[1]) {
            case 'Arn':
                const cfResource = (await resolvers.getCFResources(serviceConfig))
                                        .find(x => x.LogicalResourceId == resourceName);
                if(!cfResource) {
                    return action;
                }
                const sqs = new aws.SQS(serviceConfig);
                const attribs = await sqs.getQueueAttributes({
                    QueueUrl: cfResource.PhysicalResourceId,
                    AttributeNames: ["QueueArn"]
                }).promise();
                if(!attribs || !attribs.Attributes) {
                    return action;
                }
                return attribs.Attributes.QueueArn;
            case 'QueueName':
                return resource.Properties.QueueName;
            default:
                return parameters;
        }
    }
}
