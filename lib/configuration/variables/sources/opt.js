import ensureString from 'type/string/ensure.js';
import ServerlessError from '../../../serverless-error.js';

export default {
  resolve: ({ address, options, isSourceFulfilled }) => {
    address = ensureString(address, {
      isOptional: true,
      Error: ServerlessError,
      errorMessage: 'Non-string address argument in variable "opt" source: %v',
      errorCode: 'INVALID_OPT_SOURCE_ADDRESS',
    });

    if (!isSourceFulfilled) {
      if (address == null) return { value: null, isPending: true };
      if (options[address] !== undefined) return { value: options[address] };
      return { value: null, isPending: true };
    }

    if (address == null) return { value: options };

    return { value: options[address] == null ? null : options[address] };
  },
};
