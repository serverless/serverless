const resolvers = require('.');

module.exports = {
    Ref: resolvers.resolveResourceId,
    'Fn::GetAtt': async (plugin, resource, resourceName, parameters, serviceConfig) => {
        const cf = await resolvers.getCFResources(serviceConfig);
        const cfResource = cf.find(x => x.LogicalResourceId == resourceName);
        if(!cfResource) {
            return action;
        }
        switch(parameters[1]) {
            case 'Name':
                const lastIndex = cfResource.PhysicalResourceId.lastIndexOf(':')
                return cfResource.PhysicalResourceId.substr(lastIndex + 1);
        }
    }
}
