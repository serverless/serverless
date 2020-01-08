const resolvers = require('.');

module.exports = {
    Ref: resolvers.resolveResourceId,
    'Fn::GetAtt': (resource, resourceName, parameters, serviceConfig) => {
        return parameters;
    }
}
