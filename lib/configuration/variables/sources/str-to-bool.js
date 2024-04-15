import ensureString from 'type/string/ensure.js';
import toShortString from 'type/lib/to-short-string.js';
import ServerlessError from '../../../serverless-error.js';

const trueStrings = new Set(['true', '1']);
const falseStrings = new Set(['false', '0']);

export default {
  resolve: ({ params }) => {
    if (!params || params[0] == null) {
      throw new ServerlessError('Missing "strToBool" input', 'MISSING_STR_TO_BOOL_SOURCE_VALUE');
    }
    const stringValue = ensureString(params[0], {
      Error: ServerlessError,
      errorMessage: 'Non-string "strToBool" input:. Received: %v',
      errorCode: 'INVALID_STR_TO_BOOL_SOURCE_VALUE',
    })
      .trim()
      .toLowerCase();

    if (trueStrings.has(stringValue)) return { value: true };
    if (falseStrings.has(stringValue)) return { value: false };

    throw new ServerlessError(
      'Invalid "strToBool" input: Expected either "true", "false", "0", or "1". ' +
        `Received: ${toShortString(params[0])}`,
      'INVALID_STR_TO_BOOL_SOURCE_VALUE'
    );
  },
};
