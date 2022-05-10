'use strict';

const ensurePlainObject = require('type/plain-object/ensure');
const ensureString = require('type/string/ensure');
const path = require('path');
const fsp = require('fs').promises;
const ServerlessError = require('../serverless-error');
const fileExists = require('../utils/fs/file-exists');
const resolveInput = require('./resolve-input');

const supportedExtensions = new Set(['yml', 'yaml', 'json', 'js', 'ts']);

module.exports = async (options = {}) => {
  if (!options) options = {};
  const cliOptions =
    ensurePlainObject(options.options, { isOptional: true }) || resolveInput().options;
  const cwd = path.resolve(ensureString(options.cwd, { isOptional: true }) || process.cwd());
  const customConfigName = cliOptions.config;

  if (customConfigName) {
    const customConfigPath = path.resolve(cwd, customConfigName);
    if (!supportedExtensions.has(path.extname(customConfigPath).slice(1))) {
      throw new ServerlessError(
        'Invalid "--config" value: Unsupported file extension ' +
          `(expected one of: ${Array.from(supportedExtensions).join(', ')}`,
        'INVALID_SERVICE_CONFIG_PATH'
      );
    }
    const stats = await (async () => {
      try {
        return await fsp.stat(customConfigPath);
      } catch (error) {
        if (error.code === 'ENOENT') {
          throw new ServerlessError(
            `'Invalid "--config" value: Cannot find "${customConfigName}" in service folder`,
            'INVALID_SERVICE_CONFIG_PATH'
          );
        }
        throw new ServerlessError(
          `Invalid "--config" value: "${customConfigName}" is not accessible: ${error.stack}`,
          'INVALID_SERVICE_CONFIG_PATH'
        );
      }
    })();
    if (!stats.isFile()) {
      throw new ServerlessError(
        `Invalid "--config" value: "${customConfigName}" is not a file`,
        'INVALID_SERVICE_CONFIG_PATH'
      );
    }
    if (cwd !== path.dirname(customConfigPath)) {
      throw new ServerlessError(
        'Service configuration is expected to be placed in a root of a service (working directory). All paths, function handlers in a configuration are resolved against service directory.\n',
        'NESTED_CUSTOM_CONFIGURATION_PATH'
      );
    }
    return customConfigPath;
  }

  for (const extension of supportedExtensions) {
    const eventualServiceConfigPath = path.resolve(cwd, `serverless.${extension}`);
    if (await fileExists(eventualServiceConfigPath)) return eventualServiceConfigPath;
  }
  return null;
};
