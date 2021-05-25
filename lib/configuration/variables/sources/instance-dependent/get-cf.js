'use strict';

const ensureString = require('type/string/ensure');
const _ = require('lodash');
const ServerlessError = require('../../../../serverless-error');

module.exports = (serverlessInstance) => {
  return {
    resolve: async ({ address, params }) => {
      // cf(region = null):stackName.outputLogicalId
      if (!address) {
        throw new ServerlessError(
          'Missing address argument in variable "cf" source',
          'MISSING_SLS_SOURCE_ADDRESS'
        );
      }
      address = ensureString(address, {
        Error: ServerlessError,
        errorMessage: 'Non-string address argument in variable "cf" source: %v',
        errorCode: 'INVALID_CF_SOURCE_ADDRESS',
      });
      const separatorIndex = address.indexOf('.');
      if (separatorIndex === -1) {
        throw new ServerlessError(
          `Unsupported "${address}" address argument in variable "cf" source. ` +
            'Expected "<stack-name>.<output-id>" format',
          'UNSUPPORTED_SLS_SOURCE_ADDRESS'
        );
      }
      const stackName = address.slice(0, separatorIndex);
      const outputLogicalId = address.slice(separatorIndex + 1);

      const result = await (async () => {
        try {
          return await serverlessInstance
            .getProvider('aws')
            .request(
              'CloudFormation',
              'describeStacks',
              { StackName: stackName },
              { useCache: true, region: params && params[0] }
            );
        } catch (error) {
          if (
            error.code === 'AWS_CLOUD_FORMATION_DESCRIBE_STACKS_VALIDATION_ERROR' &&
            error.message.includes('does not exist')
          ) {
            return null;
          }
          throw error;
        }
      })();

      if (!result) return { value: null };
      const outputs = result.Stacks[0].Outputs;
      const output = outputs.find((x) => x.OutputKey === outputLogicalId);

      return { value: _.get(output, 'OutputValue', null) };
    },
  };
};
