'use strict';
const resolvers = require('.');

async function getAtt(plugin, resource, resourceName, parameters, serviceConfig) {
  const cf = await resolvers.getCFResources(serviceConfig);
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
}

module.exports = {
  'Ref': resolvers.resolveResourceId,
  'Fn::GetAtt': getAtt,
};
