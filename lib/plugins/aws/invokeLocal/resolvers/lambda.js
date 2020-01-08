const aws = require('aws-sdk');

module.exports = {
    Ref: (resource) => {
        return resource.Properties.FunctionName;
    },
    'Fn::GetAtt': async (resource, resourceName, parameters, serviceConfig) => {
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
            default:
                throw Error(`attribute (${parameters[1]}) for ${resource.Properties.FunctionName} not supported`);
        }
    }
}
