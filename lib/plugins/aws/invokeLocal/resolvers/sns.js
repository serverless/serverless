'use strict';
const resolvers = require('.');

module.exports = {
  'Ref': resolvers.resolveResourceId,
  'Fn::GetAtt': (plugin, resource, resourceName, parameters) => {
    switch (parameters[1]) {
      case 'TopicName':
        return new Promise(resolve => {
          resolve(resource.Properties.TopicName);
        });
      default:
        return new Promise(resolve => {
          resolve(parameters);
        });
    }
  },
};
