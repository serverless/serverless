'use strict';

const ensureString = require('type/string/ensure');
const ServerlessError = require('../../../../serverless-error');

module.exports = (serverlessInstance) => {
  return {
    resolve: async ({ address, options, resolveConfigurationProperty }) => {
      if (!address) {
        throw new ServerlessError(
          'Missing address argument in variable "aws" source',
          'MISSING_AWS_SOURCE_ADDRESS'
        );
      }

      address = ensureString(address, {
        Error: ServerlessError,
        errorMessage: 'Non-string address argument in variable "sls" source: %v',
        errorCode: 'INVALID_AWS_SOURCE_ADDRESS',
      });

      switch (address) {
        case 'accountId': {
          const { Account } = await serverlessInstance
            .getProvider('aws')
            .request('STS', 'getCallerIdentity', {}, { useCache: true });
          return { value: Account };
        }
        case 'region': {
          let region = options.region;
          if (!region) region = await resolveConfigurationProperty(['provider', 'region']);
          if (!region) region = 'us-east-1';
          return { value: region };
        }
        default:
          throw new ServerlessError(
            `Unsupported "${address}" address argument in variable "aws" source`,
            'UNSUPPORTED_AWS_SOURCE_ADDRESS'
          );
      }
    },
  };
};
