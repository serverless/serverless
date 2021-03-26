'use strict';

const ensureString = require('type/string/ensure');
const ServerlessError = require('../../../../serverless-error');

module.exports = (serverlessInstance) => {
  return {
    resolve: ({ address }) => {
      if (!address) {
        throw new ServerlessError(
          'Missing address argument in variable "sls" source',
          'MISSING_SLS_SOURCE_ADDRESS'
        );
      }
      address = ensureString(address, {
        Error: ServerlessError,
        errorMessage: 'Non-string address argument in variable "sls" source: %v',
      });

      switch (address) {
        case 'instanceId':
          return { value: serverlessInstance.instanceId };
        default:
          throw new ServerlessError(
            `Unsupported "${address}" address argument in variable "sls" source`,
            'UNSUPPORTED_SLS_SOURCE_ADDRESS'
          );
      }
    },
  };
};
