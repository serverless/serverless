'use strict';

module.exports = {
  'Fn::GetAtt': (plugin, resource, resourceName, parameters) => {
    return new Promise(resolve => {
      resolve(parameters);
    });
  },
};
