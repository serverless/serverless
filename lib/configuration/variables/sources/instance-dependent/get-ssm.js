'use strict';

const ensureString = require('type/string/ensure');
const ServerlessError = require('../../../../serverless-error');
const logDeprecation = require('../../../../utils/logDeprecation');

module.exports = (serverlessInstance) => {
  return {
    resolve: async ({ address, params, resolveConfigurationProperty }) => {
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
      const region = !params || !params[0] || params[0] === 'raw' ? undefined : params[0];
      const shouldReturnRawValue = params && (params[0] === 'raw' || params[1] === 'raw');

      // TODO: Remove legacy instruction separator handling with next major
      let legacyShouldEnforceDecrypt = false;
      let legacyShouldEnforceSplit = false;
      const shouldEnforceModernResolver =
        (await resolveConfigurationProperty(['variablesResolutionMode'])) >= 20210326;
      if (!shouldEnforceModernResolver) {
        const legacyInstructionSeparator = address.lastIndexOf('~');
        if (legacyInstructionSeparator !== -1) {
          const instruction = address.slice(legacyInstructionSeparator + 1);
          address = address.slice(0, legacyInstructionSeparator);
          if (instruction === 'true') legacyShouldEnforceDecrypt = true;
          else if (instruction === 'split') legacyShouldEnforceSplit = true;
          logDeprecation(
            'NEW_VARIABLES_RESOLVER',
            'Syntax for referencing SSM parameters was upgraded with ' +
              'automatic type detection ' +
              'and there\'s no need to add "~true" or "~split" postfixes to variable references.\n' +
              'Drop those postfixes and set "variablesResolutionMode: 20210326" in your ' +
              'service config to adapt to a new behavior.\n' +
              'Starting with next major release, ' +
              'this will be communicated with a thrown error.\n',
            { serviceConfig: serverlessInstance.configurationInput }
          );
        }
      }
      const result = await (async () => {
        try {
          return await serverlessInstance.getProvider('aws').request(
            'SSM',
            'getParameter',
            {
              Name: address,
              WithDecryption: true,
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
          if (!shouldEnforceModernResolver && legacyShouldEnforceSplit) {
            throw new ServerlessError(
              'Unexpected "ssm" variable "~split" instruction for non "StringList" value type. ' +
                "Please remove the postfix as it'll break the resolution in next major version." +
                'Falling back to old resolver',
              'NOT_COMPLIANT_LEGACY_SSM_INSTRUCTION'
            );
          }
          return { value: result.Parameter.Value };
        case 'StringList':
          if (!shouldEnforceModernResolver && !shouldReturnRawValue && !legacyShouldEnforceSplit) {
            throw new ServerlessError(
              'Unexpected "ssm" variable with no "~split" instruction ' +
                'for "StringList" value type. ' +
                'Set "variablesResolutionMode: 20210326" in service config ' +
                'to automatically split result string and adapt to new bahavior. ' +
                'Falling back to old resolver',
              'NOT_COMPLIANT_LEGACY_SSM_INSTRUCTION'
            );
          }
          return {
            value: shouldReturnRawValue
              ? result.Parameter.Value
              : result.Parameter.Value.split(','),
          };
        case 'SecureString':
          if (!shouldEnforceModernResolver) {
            if (!legacyShouldEnforceDecrypt) {
              throw new ServerlessError(
                'Unexpected "ssm" variable with no "~true" instruction ' +
                  'for "SecureString" value type. ' +
                  'Set "variablesResolutionMode: 20210326" in service config ' +
                  'to automatically decrypt result string and adapt to new bahavior. ' +
                  'Falling back to old resolver',
                'NOT_COMPLIANT_LEGACY_SSM_INSTRUCTION'
              );
            }
            if (!address.startsWith('/aws/reference/secretsmanager') && !shouldReturnRawValue) {
              throw new ServerlessError(
                'Unexpected "ssm" variable with "SecureString" value for ' +
                  'non AWS Secrets manager param. ' +
                  'Set "variablesResolutionMode: 20210326" in service config ' +
                  'to automatically parse result string and adapt to new bahavior. ' +
                  'Falling back to old resolver',
                'NOT_COMPLIANT_LEGACY_SSM_INSTRUCTION'
              );
            }
          }
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
