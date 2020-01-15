'use strict';

module.exports = {
  'Fn::GetAtt': (plugin, resource, resourceName, parameters) => {
    return plugin.getCFResources().then(cf => {
      const cfResource = cf.find(x => x.LogicalResourceId === resourceName);
      if (!cfResource) {
        return parameters;
      }

      return plugin.provider
        .request('SSM', 'getParameter', {
          Name: cfResource.PhysicalResourceId,
        })
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
