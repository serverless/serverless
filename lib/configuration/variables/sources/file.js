import ensureString from 'type/string/ensure.js';
import isPlainFunction from 'type/plain-function/is.js';
import path from 'path';
import { promises as fsp } from 'fs';
import yaml from 'js-yaml';
import cloudformationSchema from '@serverless/utils/cloudformation-schema.js';
import ServerlessError from '../../../serverless-error.js';

const readFile = async (filePath, serviceDir) => {
  try {
    return await fsp.readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new ServerlessError(
      `Cannot parse "${filePath.slice(serviceDir.length + 1)}": ${error.message}`,
      'FILE_NOT_ACCESSIBLE'
    );
  }
};

export default {
  resolve: async ({
    serviceDir,
    params,
    address,
    resolveConfigurationProperty,
    resolveVariable,
    resolveVariablesInString,
    options,
  }) => {
    if (!params || !params[0]) {
      throw new ServerlessError(
        'Missing path argument in variable "file" source',
        'MISSING_FILE_SOURCE_PATH'
      );
    }

    const filePath = path.resolve(
      serviceDir,
      ensureString(params[0], {
        Error: ServerlessError,
        errorMessage: 'Non-string path argument in variable "file" source: %v',
        errorCode: 'INVALID_FILE_SOURCE_PATH_ARGUMENT',
      })
    );
    if (address != null) {
      address = ensureString(address, {
        Error: ServerlessError,
        errorMessage: 'Non-string address argument for variable "file" source: %v',
        errorCode: 'INVALID_FILE_SOURCE_ADDRESS',
      });
    }

    let isResolvedByFunction = false;

    const content = await (async () => {
      switch (path.extname(filePath)) {
        case '.yml':
        case '.yaml': {
          const yamlContent = await readFile(filePath, serviceDir);
          if (yamlContent == null) return null;
          try {
            return yaml.load(yamlContent, {
              filename: filePath,
              schema: cloudformationSchema,
            });
          } catch (error) {
            throw new ServerlessError(
              `Cannot parse "${filePath.slice(serviceDir.length + 1)}": ${error.message}`,
              'FILE_PARSE_ERROR'
            );
          }
        }
        case '.tfstate':
        // fallthrough
        case '.json': {
          const jsonContent = await readFile(filePath, serviceDir);
          if (jsonContent == null) return null;
          try {
            return JSON.parse(jsonContent);
          } catch (error) {
            throw new ServerlessError(
              `Cannot parse "${filePath.slice(serviceDir.length + 1)}": JSON parse error: ${
                error.message
              }`,
              'FILE_PARSE_ERROR'
            );
          }
        }
        case '.js':
        case '.js': {
          try {
            require.resolve(filePath);
          } catch (error) {
            return null;
          }
          let result;
          try {
            result = require(filePath);
          } catch (error) {
            throw new ServerlessError(
              `Cannot load "${filePath.slice(serviceDir.length + 1)}": Initialization error: ${
                error && error.stack ? error.stack : error
              }`,
              'FILE_CONTENT_RESOLUTION_ERROR'
            );
          }
          if (isPlainFunction(result)) {
            try {
              isResolvedByFunction = true;
              return await result({ options, resolveConfigurationProperty, resolveVariable });
            } catch (error) {
              if (error.code === 'MISSING_VARIABLE_DEPENDENCY') throw error;
              if (
                error.constructor.name === 'ServerlessError' &&
                error.message.startsWith('Cannot resolve variable at ')
              ) {
                throw error;
              }
              throw new ServerlessError(
                `Cannot resolve "${path.basename(filePath)}": Returned JS function errored with: ${
                  error && error.stack ? error.stack : error
                }`,
                'JS_FILE_FUNCTION_RESOLUTION_ERROR'
              );
            }
          }
          try {
            return await result;
          } catch (error) {
            throw new ServerlessError(
              `Cannot resolve "${path.basename(filePath)}": Received rejection: ${
                error && error.stack ? error.stack : error
              }`,
              'JS_FILE_RESOLUTION_ERROR'
            );
          }
        }
        default:
          // Anything else support as plain text
          return readFile(filePath, serviceDir);
      }
    })();

    if (!address) return { value: content };
    if (content == null) return { value: null };
    const propertyKeys = address.split('.');
    let result = content;
    for (const propertyKey of propertyKeys) {
      if (typeof result === 'string') result = await resolveVariablesInString(result);
      result = result[propertyKey];
      if (result == null) return { value: null };
      if (!isResolvedByFunction) {
        if (isPlainFunction(result)) {
          isResolvedByFunction = true;
          try {
            result = await result({ options, resolveConfigurationProperty, resolveVariable });
          } catch (error) {
            if (error.code === 'MISSING_VARIABLE_DEPENDENCY') throw error;
            if (
              error.constructor.name === 'ServerlessError' &&
              error.message.startsWith('Cannot resolve variable at ')
            ) {
              throw error;
            }
            throw new ServerlessError(
              `Cannot resolve "${address}" out of "${path.basename(
                filePath
              )}": Received rejection: ${error && error.stack ? error.stack : error}`,
              'JS_FILE_PROPERTY_FUNCTION_RESOLUTION_ERROR'
            );
          }
        } else {
          try {
            result = await result;
          } catch (error) {
            throw new ServerlessError(
              `Cannot resolve "${address}" out of "${path.basename(
                filePath
              )}": Received rejection: ${error && error.stack ? error.stack : error}`,
              'JS_FILE_PROPERTY_PROMISE_RESOLUTION_ERROR'
            );
          }
          if (result == null) return { value: null };
        }
      }
    }
    return { value: result };
  },
};
