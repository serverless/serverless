'use strict';

const ensureString = require('type/string/ensure');
const ServerlessError = require('../../../../serverless-error');
const _ = require('lodash');

module.exports = (serverlessInstance) => {
  return {
    resolve: async ({ address, params }) => {
      // ssm(region = null):param-path
      if (!address) {
        throw new ServerlessError(
          'Missing address argument in variable "ssm" source',
          'MISSING_SLS_SOURCE_ADDRESS'
        );
      }
      address = ensureString(address, {
        Error: ServerlessError,
        errorMessage: 'Non-string address argument in variable "ssm" source: %v',
        errorCode: 'INVALID_SSM_SOURCE_ADDRESS',
      });
      const shouldReturnRawValue = params && params.includes('raw');
      const shouldSkipDecryption = params && params.includes('noDecrypt');
      _.pull(params, 'raw', 'noDecrypt');
      const region = params && params[0];

      const result = await (async () => {
        try {
          return await serverlessInstance.getProvider('aws').request(
            'SSM',
            'getParameter',
            {
              Name: address,
              WithDecryption: !shouldSkipDecryption,
            },
            { useCache: true, region }
          );
        } catch (error) {
          // Check for normalized error code instead of native one
          if (error.code === 'AWS_S_S_M_GET_PARAMETER_PARAMETER_NOT_FOUND') return null;
          throw error;
        }
      })();

      if (!result) return { value: null };
      switch (result.Parameter.Type) {
        case 'String':
          return { value: result.Parameter.Value };
        case 'StringList':
          return {
            value: shouldReturnRawValue
              ? result.Parameter.Value
              : result.Parameter.Value.split(','),
          };
        case 'SecureString':
          if (shouldReturnRawValue || !result.Parameter.Value.startsWith('{')) {
            return { value: result.Parameter.Value };
          }
          try {
            return { value: JSON.parse(result.Parameter.Value) };
          } catch {
            return { value: result.Parameter.Value };
          }

        default:
          throw new Error(`Unexpected parameter type: "${result.Parameter.Type}"`);
      }
    },
  };
};
