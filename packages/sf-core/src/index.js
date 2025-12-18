import { getVersions } from './utils/index.js'
import {
  log,
  progress,
  setGlobalRendererSettings,
  getGlobalRendererSettings,
} from '@serverless/util'
import { route } from './lib/router.js'

/**
 * Runs ServerlessCore
 */
const run = async ({ command, options, debug, verbose }) => {
  const logger = log.get('core')

  // Set the logging level and initialize the main progress renderer
  setupLogging({ debug, verbose, logger })

  /**
   * Establish the "main" progress spinner.
   * This is used for the overall progress within core.
   * It's also used for the entire Compose command.
   * However, it ends right when Traditional Serverless Framework
   * starts, since there are many progresses used by the
   * Framework currently.
   *
   * To use it, simply call "progress.get('main')".
   */
  const progressMain = progress.get('main')
  progressMain.create({ message: 'Initializing' })

  // Get the versions of the Serverless Framework and its dependencies
  const versions = await getVersions()

  /**
   * Route the command to the appropriate runner
   */
  await route({
    command,
    options,
    versions,
  })
}

/**
 * Sets the logging level and initializes the main progress renderer.
 *
 * @param {Object} params - The parameters for the function.
 * @param {boolean} params.debug - The debug flag.
 * @param {boolean} params.verbose - The verbose flag.
 * @param {Object} params.logger - The logger.
 * @throws {Error} Will throw an error if the "debug" option is not a string.
 */
function setupLogging({ debug, verbose, logger }) {
  let logLevel = 'notice'
  if (
    (process.env.SLS_DEBUG !== undefined || debug !== undefined) &&
    (process.env.SLS_DEBUG !== false || debug !== false)
  ) {
    if (process.env.SLS_DEBUG) {
      debug = process.env.SLS_DEBUG
    }
    // Convert default boolean to string
    if (debug === true) {
      debug = '*'
    }
    // Validate type is a string
    if (typeof debug !== 'string') {
      throw new Error('The "debug" option must be a string')
    }
    // Set the log level
    logLevel = 'debug'
    // TODO: Set filter
  } else if (process.env.SLS_VERBOSE !== undefined || verbose === true) {
    logLevel = 'info'
  }

  // Set the global logger settings
  setGlobalRendererSettings({ logLevel })
  const loggerGlobalSettings = getGlobalRendererSettings()
  logger.debug({
    node: process.version,
    os: process.platform,
    arch: process.arch,
    shell: process.env.SHELL,
    cwd: process.cwd(),
    nodeJsPath: process.argv[0],
    scriptPath: process.argv[1],
    scriptArgs: process.argv.slice(2),
    ...loggerGlobalSettings,
  })
}

export default {
  run,
}
