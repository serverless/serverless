const aws = require('aws-sdk');
const resolvers = require('.');

module.exports = {
    Ref: resolvers.resolveResourceId,
    'Fn::GetAtt': (resource, resourceName, parameters, serviceConfig) => {
        switch(parameters[1]) {
            case 'TopicName':
                return resource.Properties.TopicName;
            default:
                return parameters;
        }
    }
}
