/**
 * FS: Enhanced file system utilities
 * Use asynchronous functions rather than synchronous
 * for better performance and to avoid blocking the event loop.
 */

/* global __SF_CORE_VERSION__ */

import fsp from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import os from 'os'
import yaml from 'js-yaml'
import { createRequire } from 'node:module'
import _ from 'lodash'
import AdmZip from 'adm-zip'

const require = createRequire(import.meta.url)

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
 * Checks if a directory exists at the given path.
 * @param path The path to check for a directory.
 * @returns A promise that resolves to true if the directory exists, false if it doesn't exist, and throws an error for other issues.
 */
const dirExists = async (path) => {
  try {
    const stats = await fsp.lstat(path)
    return stats.isDirectory()
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false
    }
    throw error
  }
}

/**
 * Reads a file asynchronously
 * @param filePath The path to the file to read.
 * @returns A promise that resolves to the result of parsing the file contents.
 */
const readFile = async (filePath) => {
  const contents = await fsp.readFile(filePath, 'utf8') // 'utf8' to get a string instead of a Buffer
  return contents || null
}

/**
 * Writes a file with the given contents.
 * Creates the directory if it doesn't exist.
 * Stringifies JSON and YAML contents.
 * @param filePath The path where the file should be written.
 * @param conts The contents to be written to the file.
 * @param options Options for writing the file. Uses fs.writeFile options.
 * @returns A promise that resolves when the file is written.
 */
const writeFile = async (filePath, conts, options) => {
  let contents = conts || ''

  await fsp.mkdir(path.dirname(filePath), { recursive: true })

  if (filePath.endsWith('.json') && typeof contents !== 'string') {
    contents = JSON.stringify(contents, null, 2)
  }

  const isYamlFile = filePath.endsWith('.yaml') || filePath.endsWith('.yml')
  if (isYamlFile && typeof contents !== 'string') {
    contents = yaml.dump(contents)
  }

  await fsp.writeFile(filePath, contents, options || {})
}

/**
 * Checks if the source is not a symbolic link.
 * @param src The source path to check.
 * @returns A boolean indicating if the source is not a symbolic link.
 */
const isNotSymbolicLink = async (src) => {
  const stats = await fsp.lstat(src)
  return !stats.isSymbolicLink()
}

/**
 * Copies the contents of a directory synchronously, with an option to exclude symbolic links.
 * @param srcDir The source directory to copy from.
 * @param destDir The destination directory to copy to.
 * @param options Options for copying, including noLinks to exclude symbolic links.
 */
const copyDirContents = async (srcDir, destDir, { noLinks = false } = {}) => {
  const entries = await fsp.readdir(srcDir, { withFileTypes: true })

  await fsp.mkdir(destDir, { recursive: true })

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name)
    const destPath = path.join(destDir, entry.name)

    if (noLinks && entry.isSymbolicLink()) {
      continue
    }

    if (entry.isDirectory()) {
      await copyDirContents(srcPath, destPath, { noLinks })
    } else {
      await fsp.copyFile(srcPath, destPath)
    }
  }
}

/**
 * Recursively removes a file or directory.
 * Fail silently if the file or directory does not exist.
 * @param targetPath The path to the file or directory to remove.
 */
const removeFileOrDirectory = async (targetPath) => {
  try {
    const stats = await fsp.lstat(targetPath)

    // Fail silently if the file or directory does not exist
    if (!stats) {
      return
    }

    if (stats.isDirectory()) {
      // If the target is a directory, recursively remove all its contents
      const entries = await fsp.readdir(targetPath, { withFileTypes: true })
      await Promise.all(
        entries.map(async (entry) => {
          const fullPath = path.join(targetPath, entry.name)
          await removeFileOrDirectory(fullPath)
        }),
      )
      await fsp.rmdir(targetPath)
    } else {
      // If the target is a file, delete it
      await fsp.unlink(targetPath)
    }
  } catch (error) {
    // Handle errors, such as 'ENOENT' (no such file or directory)
    if (error.code !== 'ENOENT') {
      throw error
    }
  }
}

/**
 * Loads YAML content with specified options.
 * @param contents The YAML content to load.
 * @param options The options for loading YAML.
 * @returns An object with either data or error.
 */
const loadYaml = (contents, options) => {
  try {
    const data = yaml.load(contents, options)
    return { data }
  } catch (error) {
    return { error }
  }
}

/**
 * Parses the content of a declarative config file, like JSON, YAML, or Terraform HCL.
 * @param filePath The path of the file.
 * @param contents The content of the file.
 * @returns The parsed data.
 */
const parseDeclarativeConfig = (filePath, contents) => {
  if (filePath.endsWith('.json') || filePath.endsWith('.tfstate')) {
    return JSON.parse(contents)
  } else if (filePath.endsWith('.yml') || filePath.endsWith('.yaml')) {
    const options = { filename: filePath }
    let result = loadYaml(contents, options)
    if (result.error && result.error.name === 'YAMLException') {
      _.merge(options, { schema: createCloudformationYamlSchema() })
      result = loadYaml(contents, options)
    }
    if (result.error) {
      throw result.error
    }
    return result.data
  }
  return contents.trim()
}

/**
 * CloudFormation intrinsic functions need to be parsed as YAML.
 */
const cloudformationIntrinsicFunctionNames = [
  'And',
  'Base64',
  'Cidr',
  'Condition',
  'Equals',
  'FindInMap',
  'GetAtt',
  'GetAZs',
  'If',
  'ImportValue',
  'Join',
  'Not',
  'Or',
  'Ref',
  'Select',
  'Split',
  'Sub',
]

/**
 * Creates custom YAML types for each CloudFormation intrinsic function
 * @param name The name of the CloudFormation function.
 * @param kind The kind of YAML node (mapping, scalar, sequence).
 * @returns A new YAML type.
 */
const createCloudFormationFunctionYamlType = (name, kind) => {
  const functionName = ['Ref', 'Condition'].includes(name)
    ? name
    : `Fn::${name}`
  return new yaml.Type(`!${name}`, {
    kind,
    construct: (data) => {
      if (name === 'GetAtt' && typeof data === 'string') {
        // Special GetAtt dot syntax
        const [first, ...tail] = data.split('.')
        data = [first, tail.join('.')]
      }
      return { [functionName]: data }
    },
  })
}

/**
 * Creates a custom schema for YAML processing that facilitates
 * the parsing of CloudFormation-specific intrinsic functions
 * @returns A custom YAML schema.
 */
const createCloudformationYamlSchema = () => {
  const types = _.flatten(
    cloudformationIntrinsicFunctionNames.map((functionName) =>
      ['mapping', 'scalar', 'sequence'].map((kind) =>
        createCloudFormationFunctionYamlType(functionName, kind),
      ),
    ),
  )
  return yaml.DEFAULT_SCHEMA.extend(types)
}

/**
 * The supported extensions for the service configuration file
 */
const supportedExtensions = new Set([
  'yml',
  'yaml',
  'json',
  'toml',
  'js',
  'mjs',
  'cjs',
  'ts',
])

/**
 * Resolves the path to the specified configuration file.
 * Iterates through all supported extensions and returns the first match.
 * @param options.configFileName The name of the service configuration file (e.g. "serverless")
 * @param options.configFileDirPath The subdirectory to look for the service configuration file in. Useful in commands like the onboarding command.
 * @returns {Promise<string | null>} The path to the service configuration file
 */
const getConfigFilePath = async (options) => {
  // Throw an error if the file name is not provided
  if (!options.configFileName) {
    throw new Error('"configFileName" is required')
  }
  // Throw an error if the directory path is not provided
  if (!options.configFileDirPath) {
    throw new Error('"configFileDirPath" is required')
  }
  for (const extension of supportedExtensions) {
    let eventualServiceConfigPath
    try {
      eventualServiceConfigPath = path.resolve(
        options.configFileDirPath || process.cwd(),
        `${options.configFileName}.${extension}`,
      )
      if (await fsp.stat(eventualServiceConfigPath)) {
        return eventualServiceConfigPath
      }
    } catch (err) {}
  }
  return null
}

/**
 * Rename Service in YAML file
 * @param {string} name - New service name
 * @param {string} serviceFilePathYml - Path to the YAML service file
 */
const renameYmlService = async (name, serviceFilePathYml) => {
  // Read YAML and get a string
  let serverlessYml = await readFile(serviceFilePathYml)
  // Change "service" or "service.name" value while keeping as a string to not lose comments in YAML
  serverlessYml = serverlessYml
    .replace(
      /(^|\s|#)service\s*:.+/,
      (ignore, prefix) =>
        `${prefix}# "service" is the name of this project. This will also be added to your AWS resource names.\nservice: ${name}`,
    )
    .replace(
      /(^|\s|#)service\s*:\s*\n(\s+)name:.+/,
      (match, prefix, indent) =>
        `${prefix}# "service" is the name of this project. This will also be added to your AWS resource names.\nservice:\n${indent}name: ${name}`,
    )
  // Rewrite YAML file
  await writeFile(serviceFilePathYml, serverlessYml)
}

/**
 * Rename service in TypeScript file
 * @param {string} name - New service name
 * @param {string} serviceFilePathTs - Path to the TypeScript service file
 */
const renameTsService = async (name, serviceFilePathTs) => {
  let serverlessTs = await readFile(serviceFilePathTs)
  // Change "service" or "service.name" value while keeping as a string to not lose comments in YAML
  serverlessTs = serverlessTs.replace(
    /(^|\s)service\s*:\s*('|").+('|")/,
    (ignore, prefix) => `${prefix}service: '${name}'`,
  )
  serverlessTs = serverlessTs.replace(
    /(^|\s)service\s*:\s*{\s*\n(\s+)name:\s*('|").+('|")/,
    (match, prefix, indent) => `${prefix}service: {\n${indent}name: '${name}'`,
  )
  await writeFile(serviceFilePathTs, serverlessTs)
}

/**
 * Rename Template in all files within a directory
 * @param {string} name - New Template name
 * @param {string} templateDir - Directory of the service
 */
const renameTemplateInAllFiles = async ({ name, templateDir }) => {
  // Rename package.json, if it exists
  const packageFilePath = path.join(templateDir, 'package.json')
  if (await fileExists(packageFilePath)) {
    let json = await readFile(packageFilePath)
    json = JSON.parse(json) // Parse the JSON after reading the file
    await writeFile(packageFilePath, { ...json, name })
  }
  // Rename package-lock.json, if it exists
  const packageLockFilePath = path.join(templateDir, 'package-lock.json')
  if (await fileExists(packageLockFilePath)) {
    let json = await readFile(packageLockFilePath)
    json = JSON.parse(json) // Parse the JSON after reading the file
    await writeFile(packageLockFilePath, { ...json, name })
  }
  // Rename serverless.yml, if it exists
  const ymlServiceFilePath = path.join(templateDir, 'serverless.yml')
  if (await fileExists(ymlServiceFilePath)) {
    await renameYmlService(name, ymlServiceFilePath)
  }
  // Rename serverless.yaml, if it exists
  const yamlServiceFilePath = path.join(templateDir, 'serverless.yaml')
  if (await fileExists(yamlServiceFilePath)) {
    await renameYmlService(name, yamlServiceFilePath)
  }
  // Rename serverless.ts, if it exists
  const tsServiceFilePath = path.join(templateDir, 'serverless.ts')
  if (await fileExists(tsServiceFilePath)) {
    await renameTsService(name, tsServiceFilePath)
  }

  // Otherwise, do nothing
}

/**
 * Rename Directory
 *
 * Check if the directory exists and rename it
 */
const renameDirectory = async ({ oldPath, newPath }) => {
  if (await dirExists(oldPath)) {
    await fsp.rename(oldPath, newPath)
  }
}

/**
 * Unzip a file asynchronously and get the full path of the extracted content
 * @param zipPath - The path to the ZIP file
 * @param extractPath - The path to extract the ZIP file to
 * @returns The full path of the extracted content
 */
const unzipFile = async (zipPath, extractPath) => {
  const zip = new AdmZip(zipPath)
  const zipEntries = zip.getEntries()

  // Extract the ZIP file
  zip.extractAllTo(extractPath, true)

  // Find the common base path (parent folder) in the ZIP file
  let commonBasePath = zipEntries.reduce((commonPath, entry) => {
    const entryPath = entry.entryName.split('/').slice(0, -1).join('/')
    if (commonPath === null) return entryPath
    if (commonPath.startsWith(entryPath)) return entryPath
    if (entryPath.startsWith(commonPath)) return commonPath
    return ''
  }, null)

  // If the common base path is the empty string or only consists of '.', there is no common parent folder
  if (!commonBasePath || commonBasePath === '.') {
    commonBasePath = ''
  }

  // Combine the extractPath with the commonBasePath
  const extractedContentsPath = path.join(extractPath, commonBasePath)
  return extractedContentsPath
}

/**
 * Get .{basePath} file path in the current working directory. This can be used
 * to cache local results, like saving the packaged zip.
 *
 * @param basePath directory name to be used for the .{basePath} file
 * @returns Path to the .{basePath} file in the current working directory
 */
const getDotServerlessLocalPath = (options) => {
  const servicePath = options?.servicePath || process.cwd()
  const basePath = `.${options?.basePath || 'serverless'}`
  return path.join(servicePath, basePath)
}

/**
 * Get .{basePath} file path in the user's home directory. This can be used
 * to cache global results, like error logs and meta file to persist data across
 * multiple commands.
 *
 * @param basePath directory name to the used for the .{basePath} file
 * @returns Path to the .{basePath} file in the user's home directory
 */
const getDotServerlessGlobalPath = (options) => {
  const servicePath = options?.servicePath || os.homedir()
  const basePath = `.${options?.basePath || 'serverless'}`
  return path.join(servicePath, basePath)
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
    // log.warning(`Cannot resolve local config file.\nError: ${error.message}`)
    try {
      // try/catch to account for very unlikely race condition where file existed
      // during readFileSync but no longer exists during rename
      const backupRcPath = `${localConfigPath}.bak`
      await fsp.rename(localConfigPath, backupRcPath)
      // log.warning(
      // `Your previous local config was renamed to ${backupRcPath} for debugging.`
      // )
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

/**
 * Saves the logged in user to the .{baseFilename}rc file.
 * Will optionally update provided values, while preserving existing values.
 */
const saveRcAuthenticatedUser = async ({
  userId,
  name,
  email,
  username,
  refreshToken,
  accessToken,
  idToken,
  expiresAt,
  defaultOrgName,
  accessKeyOrgName,
  accessKeyOfOrg,
  deleteUserInfo = false,
  baseFilename = 'serverless',
}) => {
  // Ensure userId is provided
  if (!userId) {
    throw new Error(`"userId" is required to update .${baseFilename}rc file`)
  }

  // Gets the .{baseFilename}rc file, or a default configuration if it doesn't exist
  const config = await getRcConfig(baseFilename)

  // Update config with user information
  config.userId = userId
  // Ensure these objects always exist
  config.users = config.users || {}
  config.users[userId] = config.users[userId] || {}
  config.users[userId].userId = userId
  config.users[userId].dashboard = config.users[userId].dashboard || {}
  config.users[userId].dashboard.accessKeys =
    config.users[userId].dashboard.accessKeys || {}
  // Optionally update information, if provided
  if (name) {
    config.users[userId].name = name
  }
  if (email) {
    config.users[userId].email = email
  }
  if (username) {
    config.users[userId].username = username
  }
  if (idToken) {
    config.users[userId].dashboard.idToken = idToken
  }
  if (refreshToken) {
    config.users[userId].dashboard.refreshToken = refreshToken
  }
  if (expiresAt) {
    config.users[userId].dashboard.expiresAt = expiresAt
  }
  if (accessToken) {
    config.users[userId].dashboard.accessToken = accessToken
  }
  if (defaultOrgName) {
    config.users[userId].defaultOrgName = defaultOrgName
  }
  // If both accessKeyOrgName and accessKeyOfOrg are provided, add them to the config
  if (accessKeyOrgName && accessKeyOfOrg) {
    config.users[userId].dashboard.accessKeys[accessKeyOrgName] = accessKeyOfOrg
  }

  // Optionally delete user information
  if (deleteUserInfo) {
    // eslint-disable-next-line
    delete config.users[userId]
    // Remove user session
    config.userId = null
  }

  await saveRcFile(config, await getRcGlobalPath(baseFilename))
}

/**
 * Read lastShown timestamp for a notification from .{baseFilename}rc
 * @param {Object} options
 * @param {string} options.id - Notification id
 * @param {string} [options.baseFilename='serverless'] - Base filename
 * @returns {Promise<Date|null>} Date if set, otherwise null
 */
const getRcNotificationLastShown = async ({
  id,
  baseFilename = 'serverless',
}) => {
  if (!id) return null
  const config = await getRcConfig(baseFilename)
  const iso = config?.notifications?.[id]?.lastShown
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Update lastShown timestamp for a notification in .{baseFilename}rc
 * @param {Object} options
 * @param {string} options.id - Notification id
 * @param {Date} [options.date=new Date()] - Timestamp to set
 * @param {string} [options.baseFilename='serverless'] - Base filename
 */
const setRcNotificationLastShown = async ({
  id,
  date = new Date(),
  baseFilename = 'serverless',
}) => {
  if (!id) {
    throw new Error('"id" is required')
  }
  const config = await getRcConfig(baseFilename)
  config.notifications = config.notifications || {}
  config.notifications[id] = config.notifications[id] || {}
  config.notifications[id].lastShown = date.toISOString()
  await saveRcFile(config, await getRcGlobalPath(baseFilename))
}

/**
 * Save Access Key V2 to .{baseFilename}rc file
 */
const saveRcAccessKeyV2 = async ({
  accessKey,
  orgName,
  orgId,
  isDefault = false,
  baseFilename = 'serverless',
}) => {
  if (!accessKey) {
    throw new Error('"accessKey" is required')
  }
  if (!orgName) {
    throw new Error('"orgName" is required')
  }
  if (!orgId) {
    throw new Error('"orgId" is required')
  }

  // Gets the .{baseFilename} file, or a default configuration if it doesn't exist
  const config = await getRcConfig(baseFilename)

  config.accessKeys = config.accessKeys || {}
  config.accessKeys.orgs = config.accessKeys.orgs || {}
  config.accessKeys.orgs[orgName] = config.accessKeys.orgs[orgName] || {}
  config.accessKeys.orgs[orgName].accessKey = accessKey
  config.accessKeys.orgs[orgName].orgName = orgName
  config.accessKeys.orgs[orgName].orgId = orgId

  if (isDefault) {
    config.accessKeys.defaultOrgName = orgName
  }

  await saveRcFile(config, await getRcGlobalPath(baseFilename))
}

/**
 * Remove .{baseFilename}rc User Session
 * Simply sets the userId child property to null to indicate there is
 * no current user session.
 */
const removeRcUserSession = async (baseFilename) => {
  const config = await getRcConfig(baseFilename)
  config.userId = null
  await saveRcFile(config, await getRcGlobalPath(baseFilename))
}

/**
 * Remove .{baseFilename}rc Access Key V2
 */
const removeRcAccessKeyV2 = async ({
  orgName,
  baseFilename = 'serverless',
}) => {
  if (!orgName) {
    throw new Error('"orgName" is required')
  }

  // Gets the .{baseFilename}rc file, or a default configuration if it doesn't exist
  const config = await getRcConfig(baseFilename)

  config.accessKeys = config.accessKeys || {}
  config.accessKeys.orgs = config.accessKeys.orgs || {}
  config.accessKeys.orgs[orgName] = config.accessKeys.orgs[orgName] || {}

  delete config.accessKeys.orgs[orgName]

  // If the orgName is set as the default org, set default to null
  if (config.accessKeys.defaultOrgName === orgName) {
    config.accessKeys.defaultOrgName = null
  }

  await saveRcFile(config, await getRcGlobalPath(baseFilename))
}

/**
 * Writes AWS credentials to the AWS credentials file (~/.aws/credentials).
 * @param accessKeyId The AWS access key ID.
 * @param secretAccessKey The AWS secret access key.
 */
const writeAwsCredentialsToFile = async ({
  accessKeyId,
  secretAccessKey,
  profileName = 'default',
  region = 'us-east-1',
}) => {
  const awsDirectoryPath = path.join(os.homedir(), '.aws')
  const awsCredentialsFilePath = path.join(awsDirectoryPath, 'credentials')

  // Create the .aws directory if it doesn't exist
  if (!(await dirExists(awsDirectoryPath))) {
    try {
      await fsp.mkdir(awsDirectoryPath)
    } catch (error) {
      /* Ignore */
    }
  }

  // Check if the credentials file exists
  const credentialsFileExists = await fileExists(awsCredentialsFilePath)

  // Read the credentials file if it doesn't exist
  let credentialsFileContents = ''
  if (credentialsFileExists) {
    try {
      credentialsFileContents = await readFile(awsCredentialsFilePath)
    } catch (error) {
      /* Ignore error */
    }
  }

  const profile = `[${profileName}]`

  // Check if the profile already exists in the credentials file
  const profileExists = credentialsFileContents
    ? credentialsFileContents.includes(profile)
    : false

  const newProfile = `${profile}\naws_access_key_id = ${accessKeyId}\naws_secret_access_key = ${secretAccessKey}\nregion = ${region}\n`

  // If the profile exists, replace it and the aws_access_key_id and aws_secret_access_key
  if (profileExists) {
    // Convert the credentials file to an array of lines
    const credentialsFileLines = credentialsFileContents.split('\n')
    // Find the index of the profile in the credentials file
    const profileIndex = credentialsFileLines.indexOf(profile)
    /**
     * Iterate through the lines after the profile index,
     * until the next profile line that is enclosed in [] is found.
     * If a line contains "aws_access_key_id" or "aws_secret_access_key" or "region",
     * replace it with the new value.
     */
    for (let i = profileIndex + 1; i < credentialsFileLines.length; i++) {
      if (credentialsFileLines[i].includes('aws_access_key_id')) {
        credentialsFileLines[i] = `aws_access_key_id = ${accessKeyId}`
      } else if (credentialsFileLines[i].includes('aws_secret_access_key')) {
        credentialsFileLines[i] = `aws_secret_access_key = ${secretAccessKey}`
      } else if (credentialsFileLines[i].includes('region')) {
        credentialsFileLines[i] = `region = ${region}`
      }
      // If the next profile line that is enclosed in [] is found, break the loop
      if (credentialsFileLines[i].includes('[')) {
        break
      }
    }
    // Convert the array of lines back to a string
    credentialsFileContents = credentialsFileLines.join('\n')
  } else {
    if (credentialsFileContents) {
      credentialsFileContents += `\n${newProfile}`
    } else {
      credentialsFileContents = `${newProfile}`
    }
  }

  // Write the credentials content to the file
  await writeFile(awsCredentialsFilePath, credentialsFileContents)
}

/**
 * Get Versions
 */
const getVersions = async () => {
  const versions = {}

  // 1. Primary: Use build-time injected version (Production)
  if (typeof __SF_CORE_VERSION__ !== 'undefined') {
    versions.serverless_framework = __SF_CORE_VERSION__
    return versions
  }

  // 2. Fallback: Local Development / Tests
  try {
    const pkgName = '@serverlessinc/sf-core/package.json'
    const pkgPath = require.resolve(pkgName)
    const pkg = JSON.parse(await fsp.readFile(pkgPath, 'utf8'))

    versions.serverless_framework = pkg.version || null
  } catch (err) {
    // Silent fallback
  }

  return versions
}

export {
  fileExists,
  dirExists,
  readFile,
  writeFile,
  isNotSymbolicLink,
  copyDirContents,
  removeFileOrDirectory,
  parseDeclarativeConfig,
  renameTemplateInAllFiles,
  renameDirectory,
  getConfigFilePath,
  unzipFile,
  getRcConfig,
  saveRcAuthenticatedUser,
  saveRcAccessKeyV2,
  removeRcUserSession,
  removeRcAccessKeyV2,
  getRcNotificationLastShown,
  setRcNotificationLastShown,
  getDotServerlessLocalPath,
  getDotServerlessGlobalPath,
  writeAwsCredentialsToFile,
  getVersions,
}
