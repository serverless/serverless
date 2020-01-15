'use strict';
const ServerlessError = require('../../../../classes/Error').ServerlessError;

module.exports = {
  'Fn::GetAtt': (plugin, resource, resourceName) => {
    throw new ServerlessError(`Cannot get the attribute of ${resourceName}`);
  },
};
