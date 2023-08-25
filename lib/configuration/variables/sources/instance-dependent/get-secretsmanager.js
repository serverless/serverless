'use strict';

const ensureString = require('type/string/ensure');
const ServerlessError = require('../../../../serverless-error');

const parseParamArgValue = (paramArg) => {
  let paramArgValue = paramArg.split('=')[1];
  if (!paramArgValue) {
    throw new ServerlessError(
      `Invalid "secretsmanager" variable source parameter syntax: ${paramArg}`,
      'INVALID_SECRETSMANAGER_SOURCE_PARAMETER_SYNTAX'
    );
  }
  paramArgValue = ensureString(paramArgValue, {
    Error: ServerlessError,
    errorMessage: 'Non-string parameter value in variable "secretsmanager" source: %v',
    errorCode: 'INVALID_SECRETSMANAGER_SOURCE_PARAMETER_VALUE',
  });
  return paramArgValue;
};

const pull = (sourceArray, ...removeElements) => {
  if (!Array.isArray(sourceArray)) return sourceArray;
  removeElements.forEach(value => {
    while (sourceArray.includes(value)) {
      sourceArray.splice(sourceArray.indexOf(value), 1)
    }
  })
  return sourceArray
};

module.exports = (serverlessInstance) => {
  return {
    resolve: async ({ address, params }) => {
      // secretsmanager(versionId=null, versionStage=null):secret-id
      if (!address) {
        throw new ServerlessError(
          'Missing address argument in variable "secretsmanager" source',
          'MISSING_SECRETSMANAGER_SOURCE_ADDRESS'
        );
      }
      address = ensureString(address, {
        Error: ServerlessError,
        errorMessage: 'Non-string address argument in variable "secretsmanager" source: %v',
        errorCode: 'INVALID_SECRETSMANAGER_SOURCE_ADDRESS',
      });
      const shouldReturnRawValue = params && params.includes('raw');
      let versionId =
        params && params.find((param) => param.replace(/\s+/g, '').startsWith('versionId='));
      if (versionId) {
        pull(params, versionId);
        versionId = parseParamArgValue(versionId.replace(/\s+/g, ''));
      }
      let versionStage =
        params && params.find((param) => param.replace(/\s+/g, '').startsWith('versionStage='));
      if (versionStage) {
        pull(params, versionStage);
        versionStage = parseParamArgValue(versionStage.replace(/\s+/g, ''));
      }

      pull(params, 'raw');
      const region = params && params[0];

      const getSecretValueParams = { SecretId: address };
      if (versionId) {
        getSecretValueParams.VersionId = versionId;
      }
      if (versionStage) {
        getSecretValueParams.VersionStage = versionStage;
      }

      const result = await (async () => {
        return await serverlessInstance
          .getProvider('aws')
          .request('SecretsManager', 'getSecretValue', getSecretValueParams, {
            useCache: true,
            region,
          });
      })();

      if (!result) return { value: null };
      if (result.SecretString === undefined) {
        if (result.SecretBinary) {
          throw new Error('SecretsManager binary secret values are not supported');
        } else {
          throw new Error(`Unexpected result from SecretsManager: ${JSON.stringify(result)}`);
        }
      }

      if (shouldReturnRawValue) {
        return { value: result.SecretString };
      }
      try {
        return { value: JSON.parse(result.SecretString) };
      } catch {
        return { value: result.SecretString };
      }
    },
  };
};
