'use strict';

module.exports = {
  'Fn::GetAtt': (plugin, resource, resourceName, parameters) => {
    switch (parameters[1]) {
      case 'TopicName':
        return new Promise(resolve => {
          resolve(resource.PhysicalResourceId);
        });
      default:
        return new Promise(resolve => {
          resolve(parameters);
        });
    }
  },
};
