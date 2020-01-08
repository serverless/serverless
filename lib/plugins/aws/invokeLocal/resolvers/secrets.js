const resolvers = require('.');

module.exports = {
    Ref: resolvers.resolveResourceId,
    'Fn::GetAtt': (plugin, resource, resourceName, parameters, serviceConfig) => {
        return parameters;
    }
}
