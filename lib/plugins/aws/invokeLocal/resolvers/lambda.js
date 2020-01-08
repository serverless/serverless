const aws = require('aws-sdk');
const ServerlessError = require('../../../../classes/Error').ServerlessError;

module.exports = {
    Ref: (plugin, resource) => {
        return resource.Properties.FunctionName;
    },
    'Fn::GetAtt': async (plugin, resource, resourceName, parameters, serviceConfig) => {
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
                throw ServerlessError(`attribute (${parameters[1]}) for ${resource.Properties.FunctionName} not supported`);
        }
    }
}
