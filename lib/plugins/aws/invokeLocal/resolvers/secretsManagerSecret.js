'use strict';

module.exports = {
  'Fn::GetAtt': (plugin, resource, resourceName, parameters) => {
    throw new ServerlessError(`Cannot get the attribute of ${resourceName}`);
  },
};
