'use strict';

const ensureString = require('type/string/ensure');
const isObject = require('type/object/is');
const ServerlessError = require('../serverless-error');

module.exports = (configuration) => {
  return ensureString(
    isObject(configuration.provider) ? configuration.provider.name : configuration.provider,
    {
      Error: ServerlessError,
      errorMessage: 'Invalid service configuration: "provider.name" property is missing',
    }
  );
};
