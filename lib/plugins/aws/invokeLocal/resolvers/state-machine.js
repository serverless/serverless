'use strict';
const resolvers = require('.');

module.exports = {
  'Ref': resolvers.resolveResourceId,
  'Fn::GetAtt': (plugin, resource, resourceName, parameters, serviceConfig) => {
    return resolvers.getCFResources(serviceConfig).then(cf => {
      const cfResource = cf.find(x => x.LogicalResourceId === resourceName);
      if (!cfResource) {
        return parameters;
      }
      let lastIndex;
      switch (parameters[1]) {
        case 'Name':
          lastIndex = cfResource.PhysicalResourceId.lastIndexOf(':');
          return cfResource.PhysicalResourceId.substr(lastIndex + 1);
        default:
          return parameters;
      }
    });
  },
};
