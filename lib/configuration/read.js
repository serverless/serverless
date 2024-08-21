import isPlainObject from 'type/plain-object/is.js'
import path from 'path'
import { promises as fsp } from 'fs'
import yaml from 'js-yaml'
import toml from 'toml'
import cloudformationSchema from '@serverless/utils/cloudformation-schema.js'
import ServerlessError from '../serverless-error.js'
import { require as tsxRequire } from 'tsx/cjs/api'

const buildAndLoadServerlessTsFile = async (serviceDir, configurationPath) => {
  try {
    const configModule = tsxRequire(configurationPath, import.meta.url)
    return configModule.default || configModule
  } catch (error) {
    throw new ServerlessError(
      `Cannot parse "${path.basename(
        configurationPath,
      )}": Build error: ${error.message}`,
      'CONFIGURATION_BUILD_ERROR',
    )
  }
}

const readConfigurationFile = async (configurationPath) => {
  try {
    return await fsp.readFile(configurationPath, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new ServerlessError(
        `Cannot parse "${path.basename(configurationPath)}": File not found`,
        'CONFIGURATION_NOT_FOUND',
      )
    }
    throw new ServerlessError(
      `Cannot parse "${path.basename(configurationPath)}": ${error.message}`,
      'CONFIGURATION_NOT_ACCESSIBLE',
    )
  }
}

const parseConfigurationFile = async (configurationPath) => {
  switch (path.extname(configurationPath)) {
    case '.yml':
    case '.yaml': {
      const content = await readConfigurationFile(configurationPath)
      try {
        return yaml.load(content, {
          filename: configurationPath,
          schema: cloudformationSchema,
        })
      } catch (error) {
        throw new ServerlessError(
          `Cannot parse "${path.basename(configurationPath)}": ${
            error.message
          }`,
          'CONFIGURATION_PARSE_ERROR',
        )
      }
    }
    case '.json': {
      const content = await readConfigurationFile(configurationPath)
      try {
        return JSON.parse(content)
      } catch (error) {
        throw new ServerlessError(
          `Cannot parse "${path.basename(
            configurationPath,
          )}": JSON parse error: ${error.message}`,
          'CONFIGURATION_PARSE_ERROR',
        )
      }
    }
    case '.toml': {
      const content = await readConfigurationFile(configurationPath)
      try {
        return toml.parse(content)
      } catch (error) {
        throw new ServerlessError(
          `Cannot parse "${path.basename(
            configurationPath,
          )}": JSON parse error: ${error.message}`,
          'CONFIGURATION_PARSE_ERROR',
        )
      }
    }
    case '.ts': {
      return await buildAndLoadServerlessTsFile(
        path.dirname(configurationPath),
        configurationPath,
      )
    }
    // fallthrough
    case '.cjs':
    case '.mjs':
    case '.js': {
      try {
        const content = await import(configurationPath)
        // Support ES default export
        return content.default || content
      } catch (error) {
        throw new ServerlessError(
          `Cannot load "${path.basename(
            configurationPath,
          )}": Initialization error: ${
            error && error.stack ? error.stack : error
          }`,
          'CONFIGURATION_INITIALIZATION_ERROR',
        )
      }
    }
    default:
      throw new ServerlessError(
        `Cannot parse "${path.basename(
          configurationPath,
        )}": Unsupported file extension`,
        'UNSUPPORTED_CONFIGURATION_TYPE',
      )
  }
}

export default async (configurationPath) => {
  configurationPath = path.resolve(configurationPath)

  let configuration = await parseConfigurationFile(configurationPath)

  if (!isPlainObject(configuration)) {
    throw new ServerlessError(
      `Invalid configuration at "${path.basename(
        configurationPath,
      )}": Plain object expected`,
      'INVALID_CONFIGURATION_EXPORT',
    )
  }

  // Ensure no internal complex objects and no circural references
  try {
    configuration = JSON.parse(JSON.stringify(configuration))
  } catch (error) {
    throw new ServerlessError(
      `Invalid configuration at "${path.basename(
        configurationPath,
      )}": Plain JSON structure expected, when parsing observed error: ${
        error.message
      }`,
      'INVALID_CONFIGURATION_STRUCTURE',
    )
  }
  return configuration
}
