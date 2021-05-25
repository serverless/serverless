'use strict';

const ensureString = require('type/string/ensure');
const ServerlessError = require('../../../../serverless-error');

module.exports = (serverlessInstance) => {
  return {
    resolve: async ({ address }) => {
      // s3:bucketName/key
      if (!address) {
        throw new ServerlessError(
          'Missing address argument in variable "s3" source',
          'MISSING_S3_SOURCE_ADDRESS'
        );
      }
      address = ensureString(address, {
        Error: ServerlessError,
        errorMessage: 'Non-string address argument in variable "s3" source: %v',
        errorCode: 'INVALID_S3_SOURCE_ADDRESS',
      });
      const separatorIndex = address.indexOf('/');
      if (separatorIndex === -1) {
        throw new ServerlessError(
          `Unsupported "${address}" address argument in variable "s3" source. ` +
            'Expected "<bucket-name>/<key>" format',
          'UNSUPPORTED_S3_SOURCE_ADDRESS'
        );
      }
      const bucketName = address.slice(0, separatorIndex);
      const key = address.slice(separatorIndex + 1);

      const result = await (async () => {
        try {
          return await serverlessInstance
            .getProvider('aws')
            .request('S3', 'getObject', { Bucket: bucketName, Key: key }, { useCache: true });
        } catch (error) {
          // Check for normalized error code instead of native one
          if (error.code === 'AWS_S3_GET_OBJECT_NO_SUCH_KEY') return null;
          throw error;
        }
      })();

      if (!result) return { value: null };

      return { value: String(result.Body) };
    },
  };
};
