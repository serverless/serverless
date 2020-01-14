'use strict';

module.exports = {
  'Fn::GetAtt': (plugin, resource, resourceName, parameters, serviceConfig) => {
    return plugin.getCFResources(serviceConfig).then(cf => {
      const cfResource = cf.find(x => x.LogicalResourceId === resourceName);
      if (!cfResource) {
        return parameters;
      }
      let lastIndex;
      switch (parameters[1]) {
        case 'Name':
          lastIndex = cfResource.PhysicalResourceId.lastIndexOf(':');
          return cfResource.PhysicalResourceId.slice(lastIndex + 1);
        default:
          return parameters;
      }
    });
  },
};
