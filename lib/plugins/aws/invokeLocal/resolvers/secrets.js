'use strict';
const resolvers = require('.');

module.exports = {
  'Ref': resolvers.resolveResourceId,
  'Fn::GetAtt': (plugin, resource, resourceName, parameters) => {
    return new Promise(resolve => {
      resolve(parameters);
    });
  },
};
