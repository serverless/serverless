const aws = require('aws-sdk');
async function resolve(action, parameters, resourceName, resource, getCFResources, serverless, serviceConfig) {
    
    switch(action) {
        case 'Ref':
            const cf = await getCFResources(serverless);
            const cfResource = cf.find(x => x.LogicalResourceId == resourceName);
            if(!cfResource) {
                return action;
            }
            return cfResource.PhysicalResourceId;
        case 'Fn::GetAtt':
            switch(parameters[1]) {
                case 'Arn':
                    const cf = await getCFResources(serverless);
                    const cfResource = cf.find(x => x.LogicalResourceId == resourceName);
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
            }
            break;
    }
    return action;
}

module.exports = resolve;
