import isPlainObject from 'type/plain-object/is.js';
import path from 'path';
import { promises as fsp } from 'fs';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';
import getRequire from '../utils/get-require.js';
import spawn from 'child-process-ext/spawn.js';
import cloudformationSchema from '@serverless/utils/cloudformation-schema.js';
import ServerlessError from '../serverless-error.js';

const resolveTsNode = async (serviceDir) => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
        const tsNodePath = `${String(stdoutBuffer).trim()}/ts-node`;
        return import(tsNodePath)
          .then(() => tsNodePath)
          .catch((err) => {
            if (err.code !== 'MODULE_NOT_FOUND') {
              throw new ServerlessError(
                `Cannot resolve "ts-node" due to: ${err.message}`,
                'TS_NODE_NPM_GLOBAL_RESOLUTION_ERROR'
              );
            }
            throw new ServerlessError('"ts-node" not found', 'TS_NODE_NOT_FOUND');
          });
      } catch (error) {
        // Catch any synchronous errors (unlikely in this context)
        console.error('An unexpected error occurred:', error);
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
          const tsNode = await import(tsNodePath);
          tsNode.register();
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
    case '.cjs':
    case '.mjs':
    case '.js': {
      try {
        const content = await import(configurationPath);
        // Support ES default export
        return content.default || content;
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

export default async (configurationPath) => {
  configurationPath = path.resolve(configurationPath);

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
