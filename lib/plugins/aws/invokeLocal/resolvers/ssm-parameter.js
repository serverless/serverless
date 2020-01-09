'use strict';
const aws = require('aws-sdk');
const resolvers = require('.');

module.exports = {
  'Ref': resolvers.resolveResourceId,
  'Fn::GetAtt': (plugin, resource, resourceName, parameters, serviceConfig) => {
    return resolvers.getCFResources(serviceConfig).then(cf => {
      const cfResource = cf.find(x => x.LogicalResourceId === resourceName);
      if (!cfResource) {
        return parameters;
      }

      const store = new aws.SSM(serviceConfig);
      return store
        .getParameter({
          Name: cfResource.PhysicalResourceId,
        })
        .promise()
        .then(param => {
          if (!param || !param.Parameter) {
            return parameters;
          }
          switch (parameters[1]) {
            case 'Type':
              return param.Parameter.Type;
            case 'Value':
              return param.Parameter.Value;
            default:
              return parameters;
          }
        });
    });
  },
};
