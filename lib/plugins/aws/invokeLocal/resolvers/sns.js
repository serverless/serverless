'use strict';

module.exports = {
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
