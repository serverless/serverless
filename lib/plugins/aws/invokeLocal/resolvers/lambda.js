const aws = require('aws-sdk');
async function resolve(action, parameters, resourceName, resource, getCFResources, serverless, serviceConfig) {
    switch(action) {
        case 'Ref':
            return resource.Properties.FunctionName;
        case 'Fn::GetAtt':
            switch(parameters[1]) {
                case 'Arn':
                    const lambda = new aws.Lambda(serviceConfig);
                    const func = await lambda.getFunction({
                        FunctionName: resource.Properties.FunctionName
                    }).promise();
                    if(!func) {
                        return action;
                    }
                    return func.Configuration.FunctionArn;
            }
            break;
    }
    return action;
}

module.exports = resolve;
