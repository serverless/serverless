'use strict';

const _ = require('lodash');
const ensureString = require('type/string/ensure');
const ServerlessError = require('../../../serverless-error');

module.exports = ({
  service = {},
  serviceInstanceParamsFromPlatform = {}
}) => {
  return {
    resolve: async ({
      address,
      resolveConfigurationProperty,
      options
    }) => {

      if (!address) {
        throw new ServerlessError(
          'Missing address argument in variable "param" source',
          'MISSING_PARAM_SOURCE_ADDRESS'
        );
      }
      address = ensureString(address, {
        Error: ServerlessError,
        errorMessage: 'Non-string address argument in variable "param" source: %v',
        errorCode: 'INVALID_PARAM_SOURCE_ADDRESS',
      });

      const allParams = {};
      const stage = service.provider.stage;

      // Collect all Params from CLI options, stage params, and Serverless Platform
      // If options.param is not an array, make it an array
      if (options.param && !Array.isArray(options.param)) {
        options.param = [options.param];
      }

      if (options.param) {
        const regex = /(?<key>[^=]+)=(?<value>.+)/;
        for (const item of options.param) {
          const res = item.match(regex);
          if (!res) {
            throw new ServerlessError(
              `Encountered invalid "--param" CLI option value: "${item}". Supported format: "--param='<key>=<val>'"`,
              'INVALID_CLI_PARAM_FORMAT'
            );
          }
          allParams[res.groups.key] = { value: res.groups.value.trimEnd(), type: 'cli' };
        }
      }
      const configParams = new Map(
        Object.entries(_.get(service, 'params') || {})
      );
      // Collect all params with "default"
      for (const [name, value] of new Map(Object.entries(configParams.get('default') || {}))) {
        if (value == null) continue;
        if (allParams[name] != null) continue;
        allParams[name] = { value, type: 'configService' };
      }
      // Collect all params from "stage"
      for (const [name, value] of Object.entries(configParams.get(stage) || {})) {
        if (value == null) continue;
        // Overwrite default params
        allParams[name] = { value, type: 'configServiceStage' };
      }
      // Collect all params from serviceInstanceParamsFromPlatform
      for (const [name, value] of Object.entries(serviceInstanceParamsFromPlatform || {})) {
        if (value == null) continue;
        if (allParams[name] != null) {
          throw new ServerlessError(
            `You have defined this parameter "${name}" in the Serverless Framework Dashboard as well as in your Service or CLI options. Please remove one of the definitions.`,
            'DUPLICATE_PARAM_FORMAT'
          );
        }
        allParams[name] = { value, type: 'dashboard' };
      }

      const result = {
        value: allParams[address] ?
        allParams[address].value :
        null
      };

      if (allParams[address] == null) {
        result.eventualErrorMessage = `The param "${address}" cannot be resolved from CLI options or stage params${service.org && service.app ? ' or Serverless Dashboard' : ''
          }. If you are using Serverless Framework Compose, make sure to run commands via Compose so that all parameters can be resolved`;
      }

      return result;
    },
  };
};
