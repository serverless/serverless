import ensureString from 'type/string/ensure.js';
import ServerlessError from '../../../serverless-error.js';

// Used to track env variable dependencies in specific resolution phases
// This collection is cleared on demand externally
const missingEnvVariables = new Set();

export default {
  resolve: ({ address, isSourceFulfilled }) => {
    if (!address) {
      throw new ServerlessError(
        'Missing address argument in variable "env" source',
        'MISSING_ENV_SOURCE_ADDRESS'
      );
    }
    address = ensureString(address, {
      Error: ServerlessError,
      errorMessage: 'Non-string address argument in variable "env" source: %v',
      errorCode: 'INVALID_ENV_SOURCE_ADDRESS',
    });

    if (process.env[address] == null) missingEnvVariables.add(address);
    return {
      value: process.env[address] == null ? null : process.env[address],
      isPending: !isSourceFulfilled,
    };
  },
  missingEnvVariables,
};
