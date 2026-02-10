/**
 * RC: .serverlessrc configuration file utilities
 * Moved from sf-core to util to allow usage across packages without circular dependencies.
 */

import fsp from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import os from 'os'
import _ from 'lodash'

/**
 * Checks if a file exists and is a regular file.
 * @param filePath The path to the file to check.
 * @returns A promise that resolves to true if the file exists and is a regular file, false otherwise.
 */
const fileExists = async (filePath) => {
  try {
    const stats = await fsp.lstat(filePath)
    return stats.isFile()
  } catch (e) {
    return false
  }
}

/**
 * Reads a file asynchronously
 * @param filePath The path to the file to read.
 * @returns A promise that resolves to the result of parsing the file contents.
 */
const readFile = async (filePath) => {
  const contents = await fsp.readFile(filePath, 'utf8')
  return contents || null
}

/**
 * Writes a file with the given contents.
 * Creates the directory if it doesn't exist.
 * @param filePath The path where the file should be written.
 * @param contents The contents to be written to the file.
 * @returns A promise that resolves when the file is written.
 */
const writeFile = async (filePath, contents) => {
  await fsp.mkdir(path.dirname(filePath), { recursive: true })
  await fsp.writeFile(filePath, contents, {})
}

/**
 * Get .{baseFilename}rc configuration file name.
 * The file name may be different depending on the stage.
 */
const getRcFileName = (baseFilename) => {
  if (
    process.env.SERVERLESS_PLATFORM_STAGE &&
    process.env.SERVERLESS_PLATFORM_STAGE !== 'prod'
  ) {
    baseFilename = `${baseFilename}${process.env.SERVERLESS_PLATFORM_STAGE.toLowerCase()}`
    baseFilename = baseFilename.trim()
  }
  return `.${baseFilename}rc`
}

/**
 * Get various possible .{baseFilename}rc file paths
 */
const getRcLocalPath = (baseFilename) =>
  path.join(process.cwd(), getRcFileName(baseFilename))
const getRcDefaultPath = (baseFilename = 'serverless') =>
  path.join(os.homedir(), getRcFileName(baseFilename))
const getRcDefaultConfigPath = (baseFilename) =>
  path.join(os.homedir(), '.config', getRcFileName(baseFilename))

/**
 * Gets the path to the global .{baseFilename}rc file.
 * Checks for the existence of the file in a few different common locations.
 * @returns
 */
const getRcGlobalPath = async (baseFilename) => {
  const homeConfigGlobalConfigPath = getRcDefaultConfigPath(baseFilename)
  const defaultGlobalConfigPath = getRcDefaultPath(baseFilename)
  const homeConfigGlobalConfigExists = await fileExists(
    homeConfigGlobalConfigPath,
  )
  const defaultGlobalConfigExists = await fileExists(defaultGlobalConfigPath)

  if (homeConfigGlobalConfigExists && defaultGlobalConfigExists) {
    return defaultGlobalConfigPath
  }

  if (homeConfigGlobalConfigExists) {
    return homeConfigGlobalConfigPath
  }

  return defaultGlobalConfigPath
}

/**
 * Gets the .{baseFilename}rc configuration file in the current working directory, if it exists.
 * @returns
 */
const getRcLocalConfig = async (baseFilename) => {
  const localConfigPath = getRcLocalPath(baseFilename)
  try {
    const localConfig = await readFile(localConfigPath)
    if (!localConfig) return null
    return JSON.parse(localConfig)
  } catch (error) {
    if (error.code === 'ENOENT') return {}
    try {
      // try/catch to account for very unlikely race condition where file existed
      // during readFileSync but no longer exists during rename
      const backupRcPath = `${localConfigPath}.bak`
      await fsp.rename(localConfigPath, backupRcPath)
    } catch {
      // Ignore
    }
  }

  return {}
}

/**
 * Gets the .{baseFilename}rc configuration file in the user's home directory, if it exists.
 */
const getRcGlobalConfig = async (baseFilename) => {
  const globalConfigPath = await getRcGlobalPath(baseFilename)
  try {
    const globalConfig = await readFile(globalConfigPath)
    if (!globalConfig) return null
    return JSON.parse(globalConfig)
  } catch (error) {
    // If the file does not exist, we want to recreate default global configuration
    if (error.code !== 'ENOENT') {
      try {
        const backupRcPath = `${globalConfigPath}.bak`
        await fsp.rename(globalConfigPath, backupRcPath)
      } catch {
        // Ignore
      }
    }
  }

  // If the file does not exist, we want to recreate default global configuration
  return await createRcDefaultGlobalConfig(baseFilename)
}

/**
 * Gets the local and global .{baseFilename}rc configuration files and merges them together,
 * if they exist. Otherwise, returns a new default configuration.
 * @returns
 */
const getRcConfig = async (baseFilename) => {
  const localConfig = await getRcLocalConfig(baseFilename)
  const globalConfig = await getRcGlobalConfig(baseFilename)
  return _.merge(globalConfig, localConfig)
}

/**
 * Saves .{baseFilename}rc file and includes meta information
 * @param config
 * @param configPath
 */
const saveRcFile = async (config, configPath) => {
  config.meta = config.meta || {}
  config.meta.updated_at = Math.round(Date.now() / 1000)
  const jsonConfig = JSON.stringify(config, null, 2)
  try {
    await writeFile(configPath, jsonConfig)
  } catch (error) {
    /** Empty Catch */
  }
}

/**
 * Creates a default .{baseFilename}rc file in the user's default home directory
 * and returns the default configuration.
 * @returns
 */
const createRcDefaultGlobalConfig = async (baseFilename) => {
  const defaultConfig = {
    userId: null, // currentUserId
    frameworkId: randomUUID(),
    trackingDisabled: false,
    enterpriseDisabled: false,
    meta: {
      created_at: Math.round(Date.now() / 1000), // config file creation date
      updated_at: null, // config file updated date
    },
    users: {},
    accessKeys: {
      orgs: {},
      defaultOrgName: null,
    },
    // Per-notification display tracking (e.g., throttling)
    notifications: {},
  }
  await saveRcFile(defaultConfig, getRcDefaultPath(baseFilename))
  return defaultConfig
}

export {
  getRcConfig,
  getRcFileName,
  getRcGlobalPath,
  getRcDefaultPath,
  getRcDefaultConfigPath,
  getRcLocalPath,
  getRcLocalConfig,
  getRcGlobalConfig,
  saveRcFile,
  createRcDefaultGlobalConfig,
}
