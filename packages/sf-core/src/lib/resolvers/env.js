import path from 'path'
import { existsSync } from 'node:fs'
import dotenv from 'dotenv'

/**
 * @typedef {Object} LoadEnvFilesOptions
 * @property {string} stage - The name of the stage.
 * @property {string} configFileDirPath - The path to the configuration directory.
 */

/**
 * Load environment variables from .env and .env.[stageName] files.
 * This function is responsible for loading environment variables from .env and .env.[stageName] files.
 * If the .env or .env.[stageName] file does not exist, it will be ignored.
 * @param {LoadEnvFilesOptions} options - The options for loading environment variables.
 */

export const loadEnvFiles = ({ stage, configFileDirPath }) => {
  if (!configFileDirPath) {
    configFileDirPath = process.cwd()
  }
  if (stage) {
    // Load .env.[stageName] file
    loadStageEnvFiles({ stage, configFileDirPath })
  }
  // Load .env file
  const defaultEnvPath = path.resolve(configFileDirPath, '.env')
  if (existsSync(defaultEnvPath)) {
    dotenv.config({ path: defaultEnvPath })
  }
}

/**
 * Load environment variables from .env and .env.[stageName] files.
 * @param {LoadEnvFilesOptions} options - The options for loading environment variables.
 */
export const loadStageEnvFiles = ({ stage, configFileDirPath }) => {
  if (!configFileDirPath) {
    configFileDirPath = process.cwd()
  }
  // Load .env.[stageName] file
  const stageEnvPath = path.resolve(configFileDirPath, `.env.${stage}`)
  if (existsSync(stageEnvPath)) {
    dotenv.config({ path: stageEnvPath })
  }
}
