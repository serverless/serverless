'use strict';

const ensureString = require('type/string/ensure');
const isPlainObject = require('type/plain-object/is');
const path = require('path');
const fsp = require('fs').promises;
const yaml = require('js-yaml');
const getRequire = require('../utils/get-require');
const spawn = require('child-process-ext/spawn');
const cloudformationSchema = require('@serverless/utils/cloudformation-schema');
const ServerlessError = require('../serverless-error');

const resolveTsNode = async (serviceDir) => {
  // 1. If installed aside of a Framework, use it
  try {
    return getRequire(__dirname).resolve('ts-node');
  } catch (slsDepError) {
    if (slsDepError.code !== 'MODULE_NOT_FOUND') {
      throw new ServerlessError(
        `Cannot resolve "ts-node" due to: ${slsDepError.message}`,
        'TS_NODE_RESOLUTION_ERROR'
      );
    }

    // 2. If installed in a service, use it
    try {
      return getRequire(serviceDir).resolve('ts-node');
    } catch (serviceDepError) {
      if (serviceDepError.code !== 'MODULE_NOT_FOUND') {
        throw new ServerlessError(
          `Cannot resolve "ts-node" due to: ${serviceDepError.message}`,
          'TS_NODE_IN_SERVICE_RESOLUTION_ERROR'
        );
      }

      // 3. If installed globally, use it
      const { stdoutBuffer } = await (async () => {
        try {
          return await spawn('npm', ['root', '-g']);
        } catch (error) {
          if (error.code !== 'ENOENT') {
            throw new ServerlessError(
              `Cannot resolve "ts-node" due to unexpected "npm" error: ${error.message}`,
              'TS_NODE_NPM_RESOLUTION_ERROR'
            );
          }
          throw new ServerlessError('"ts-node" not found', 'TS_NODE_NOT_FOUND');
        }
      })();
      try {
        return require.resolve(`${String(stdoutBuffer).trim()}/ts-node`);
      } catch (globalDepError) {
        if (globalDepError.code !== 'MODULE_NOT_FOUND') {
          throw new ServerlessError(
            `Cannot resolve "ts-node" due to: ${globalDepError.message}`,
            'TS_NODE_NPM_GLOBAL_RESOLUTION_ERROR'
          );
        }
        throw new ServerlessError('"ts-node" not found', 'TS_NODE_NOT_FOUND');
      }
    }
  }
};

const readConfigurationFile = async (configurationPath) => {
  try {
    return await fsp.readFile(configurationPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new ServerlessError(
        `Cannot parse "${path.basename(configurationPath)}": File not found`,
        'CONFIGURATION_NOT_FOUND'
      );
    }
    throw new ServerlessError(
      `Cannot parse "${path.basename(configurationPath)}": ${error.message}`,
      'CONFIGURATION_NOT_ACCESSIBLE'
    );
  }
};

const parseConfigurationFile = async (configurationPath) => {
  switch (path.extname(configurationPath)) {
    case '.yml':
    case '.yaml': {
      const content = await readConfigurationFile(configurationPath);
      try {
        return yaml.load(content, {
          filename: configurationPath,
          schema: cloudformationSchema,
        });
      } catch (error) {
        throw new ServerlessError(
          `Cannot parse "${path.basename(configurationPath)}": ${error.message}`,
          'CONFIGURATION_PARSE_ERROR'
        );
      }
    }
    case '.json': {
      const content = await readConfigurationFile(configurationPath);
      try {
        return JSON.parse(content);
      } catch (error) {
        throw new ServerlessError(
          `Cannot parse "${path.basename(configurationPath)}": JSON parse error: ${error.message}`,
          'CONFIGURATION_PARSE_ERROR'
        );
      }
    }
    case '.ts': {
      if (!process[Symbol.for('ts-node.register.instance')]) {
        const tsNodePath = await (async () => {
          try {
            return await resolveTsNode(path.dirname(configurationPath));
          } catch (error) {
            throw new ServerlessError(
              `Cannot parse "${path.basename(
                configurationPath
              )}": Resolution of "ts-node" failed with: ${error.message}`,
              'CONFIGURATION_RESOLUTION_ERROR'
            );
          }
        })();
        try {
          require(tsNodePath).register();
        } catch (error) {
          throw new ServerlessError(
            `Cannot parse "${path.basename(
              configurationPath
            )}": Register of "ts-node" failed with: ${error.message}`,
            'CONFIGURATION_RESOLUTION_ERROR'
          );
        }
      }
    }
    // fallthrough
    case '.js': {
      const configurationEventuallyDeferred = (() => {
        try {
          require.resolve(configurationPath);
        } catch {
          throw new ServerlessError(
            `Cannot load "${path.basename(configurationPath)}": File not found`,
            'CONFIGURATION_NOT_FOUND'
          );
        }
        try {
          return require(configurationPath);
        } catch (error) {
          throw new ServerlessError(
            `Cannot load "${path.basename(configurationPath)}": Initialization error: ${
              error && error.stack ? error.stack : error
            }`,
            'CONFIGURATION_INITIALIZATION_ERROR'
          );
        }
      })();
      try {
        return await configurationEventuallyDeferred;
      } catch (error) {
        throw new ServerlessError(
          `Cannot load "${path.basename(configurationPath)}": Initialization error: ${
            error && error.stack ? error.stack : error
          }`,
          'CONFIGURATION_INITIALIZATION_ERROR'
        );
      }
    }
    default:
      throw new ServerlessError(
        `Cannot parse "${path.basename(configurationPath)}": Unsupported file extension`,
        'UNSUPPORTED_CONFIGURATION_TYPE'
      );
  }
};

module.exports = async (configurationPath) => {
  configurationPath = path.resolve(
    ensureString(configurationPath, {
      name: 'configurationPath',
    })
  );

  let configuration = await parseConfigurationFile(configurationPath);

  if (!isPlainObject(configuration)) {
    throw new ServerlessError(
      `Invalid configuration at "${path.basename(configurationPath)}": Plain object expected`,
      'INVALID_CONFIGURATION_EXPORT'
    );
  }

  // Ensure no internal complex objects and no circural references
  try {
    configuration = JSON.parse(JSON.stringify(configuration));
  } catch (error) {
    throw new ServerlessError(
      `Invalid configuration at "${path.basename(
        configurationPath
      )}": Plain JSON structure expected, when parsing observed error: ${error.message}`,
      'INVALID_CONFIGURATION_STRUCTURE'
    );
  }
  return configuration;
};
