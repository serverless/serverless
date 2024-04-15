import ensureString from 'type/string/ensure.js';
import isObject from 'type/object/is.js';
import ServerlessError from '../serverless-error.js';
import resolveCliInput from '../cli/resolve-input.js';

export default (configuration) => {
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
