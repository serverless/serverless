'use strict';

const ensureString = require('type/string/ensure');
const isPlainFunction = require('type/plain-function/is');
const _ = require('lodash');
const path = require('path');
const fs = require('fs').promises;
const yaml = require('js-yaml');
const cloudformationSchema = require('@serverless/utils/cloudformation-schema');
const ServerlessError = require('../../../serverless-error');

const readFile = async (filePath, servicePath) => {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new ServerlessError(
        `Cannot parse "${filePath.slice(servicePath.length + 1)}": File not found`,
        'FILE_NOT_FOUND'
      );
    }
    throw new ServerlessError(
      `Cannot parse "${filePath.slice(servicePath.length + 1)}": ${error.message}`,
      'FILE_NOT_ACCESSIBLE'
    );
  }
};

module.exports = {
  resolve: async ({ servicePath, params, address, resolveConfigurationProperty, options }) => {
    if (!params || !params[0]) {
      throw new ServerlessError(
        'Missing path argument in variable "file" source',
        'MISSING_FILE_SOURCE_PATH'
      );
    }
    const filePath = path.resolve(
      servicePath,
      ensureString(params[0], {
        Error: ServerlessError,
        errorMessage: 'Non-string path argument in variable "file" source: %v',
      })
    );
    if (!filePath.startsWith(`${servicePath}${path.sep}`)) {
      throw new ServerlessError(
        'Cannot load file from outside of service folder',
        'FILE_SOURCE_PATH_OUTSIDE_OF_SERVICE'
      );
    }
    if (address != null) {
      address = ensureString(address, {
        Error: ServerlessError,
        errorMessage: 'Non-string address argument for variable "file" source: %v',
      });
    }

    const content = await (async () => {
      switch (path.extname(filePath)) {
        case '.yml':
        case '.yaml': {
          const yamlContent = await readFile(filePath);
          try {
            return yaml.load(yamlContent, {
              filename: filePath,
              schema: cloudformationSchema,
            });
          } catch (error) {
            throw new ServerlessError(
              `Cannot parse "${filePath.slice(servicePath.length + 1)}": ${error.message}`,
              'FILE_PARSE_ERROR'
            );
          }
        }
        case '.tfstate':
        // fallthrough
        case '.json': {
          const jsonContent = await readFile(filePath);
          try {
            return JSON.parse(jsonContent);
          } catch (error) {
            throw new ServerlessError(
              `Cannot parse "${filePath.slice(servicePath.length + 1)}": JSON parse error: ${
                error.message
              }`,
              'FILE_PARSE_ERROR'
            );
          }
        }
        case '.js': {
          try {
            require.resolve(filePath);
          } catch (error) {
            throw new ServerlessError(
              `Cannot load "${filePath.slice(servicePath.length + 1)}": File not found`,
              'FILE_NOT_FOUND'
            );
          }
          try {
            const result = require(filePath);
            if (isPlainFunction(result)) {
              if (!(await resolveConfigurationProperty(['variablesResolutionMode']))) {
                throw new ServerlessError(
                  `Cannot parse "${path.basename(
                    filePath
                  )}": Resolved a JS function not confirmed to work with a new parser, ` +
                    'falling back to old resolver',
                  'FILE_CONTENT_RESOLUTION_ERROR'
                );
              }
              return await result({ options, resolveConfigurationProperty });
            }
            return await result;
          } catch (error) {
            throw new ServerlessError(
              `Cannot load "${filePath.slice(servicePath.length + 1)}": Initialization error: ${
                error && error.stack ? error.stack : error
              }`,
              'FILE_CONTENT_RESOLUTION_ERROR'
            );
          }
        }
        default:
          throw new ServerlessError(
            `Cannot parse "${path.basename(filePath)}": Unsupported file extension`,
            'UNSUPPORTED_FILE_TYPE'
          );
      }
    })();

    if (!address) return content;
    const result = _.get(content, address, null);
    if (!isPlainFunction(result)) return result;
    if (!(await resolveConfigurationProperty(['variablesResolutionMode']))) {
      throw new ServerlessError(
        `Cannot parse "${path.basename(
          filePath
        )}": Resolved a JS function not confirmed to work with a new parser, ` +
          'falling back to old resolver',
        'FILE_CONTENT_RESOLUTION_ERROR'
      );
    }
    return await result({ options, resolveConfigurationProperty });
  },
};
