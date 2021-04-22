'use strict';

const ensureString = require('type/string/ensure');
const isObject = require('type/object/is');
const ServerlessError = require('../serverless-error');
const resolveCliInput = require('../cli/resolve-input');

module.exports = (configuration) => {
  try {
    return ensureString(
      isObject(configuration.provider) ? configuration.provider.name : configuration.provider,
      {
        Error: ServerlessError,
        errorMessage: 'Invalid service configuration: "provider.name" property is missing',
        errorCode: 'INVALID_CONFIGURATION_PROVIDER_NAME_MISSING',
      }
    );
  } catch (error) {
    if (resolveCliInput().isHelpRequest) return null;
    throw error;
  }
};
