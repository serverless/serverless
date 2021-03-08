'use strict';

const ensureString = require('type/string/ensure');
const ServerlessError = require('../../../serverless-error');

module.exports = {
  resolve: ({ address, options }) => {
    address = ensureString(address, {
      isOptional: true,
      Error: ServerlessError,
      errorMessage: 'Non-string address argument in variable "opt" source: %v',
    });

    return { value: address == null ? options : options[address] || null };
  },
};
