import os from 'os'
import { readFile } from '../utils/index.js'
import {
  ServerlessError,
  ServerlessErrorCodes,
  instanceUsageTrackingClient,
  platformEventClient,
  isCICDEnvironment,
  log,
  progress,
} from '@serverless/util'
import { readdir } from 'fs/promises'
import path from 'path'
import readConfig from '@serverless/framework/lib/configuration/read.js'
import { commandExist, validateCliSchema } from '../utils/cli/cli.js'
import { createHash } from 'crypto'
import saveMeta from './meta/index.js'
import { CoreRunner } from './runners/core/core.js'
import { CfnRunner } from './runners/cfn/cfn.js'
import { TraditionalRunner } from './runners/framework.js'
import { ComposeRunner } from './runners/compose/compose.js'
import { ServerlessContainerFrameworkRunner } from './runners/scf.js'
import { ServerlessAiFrameworkRunner } from './runners/sai.js'
import {
  addCommonDeploymentData,
  saveDeployment,
} from './platform/deployments.js'
import { variables } from './resolvers/index.js'
import { logDeferredNotifications } from './runners/notification.js'

const runners = [
  ComposeRunner,
  CfnRunner,
  ServerlessContainerFrameworkRunner,
  ServerlessAiFrameworkRunner,
  TraditionalRunner,
]

/**
 * @typedef {Object} ComposeConfig
 * @property {Object} params - Parsed param values to pass to runners.
 * @property {Object} serviceParams - Parsed compose service key-value pair params to pass to runners.
 * @property {Object} resolverProviders - Resolver providers to pass to runners.
 * @property {boolean} [isWithinCompose=false] - Whether the command is run within Compose.
 * @property {string} [orgName=null] - If run within Compose, this is the organization name within the Compose config file.
 * @property {string} [serviceName=null] - If run within Compose, this is the service name within the Compose config file.
 */

/**
 * Routes to the appropriate runner, based on the command, options,
 * presence of a config file, and content of the config file.
 *
 * @param {Object} params - Parameters for routing.
 * @param {string[]} params.command - An array of string commands to execute.
 * @param {Object} params.options - Options for the command.
 * @param {Object} params.versions - Available versions (likely of a tool or dependency).
 * @param {ComposeConfig} params.compose - Compose configuration object.
 * @returns {Promise<void>} - Resolves when routing is complete.
 */
const route = async ({ command, options, versions, compose }) => {
  const logger = log.get('core:router')
  const progressMain = progress.get('main')
  progressMain.notice('Initializing')

  logger.debug({
    command,
    options,
    versions,
    compose,
  })

  const { runner, resolverManager, configFilePath, config, configFileRaw } =
    await getRunner({
      logger,
      command,
      options,
      compose,
      versions,
    })

  const schema = runner.getCliSchema()
  if (schema) {
    const {
      helpPrinted,
      versionPrinted,
      command: parsedCommand,
      options: parsedOptions,
    } = await validateCliSchema({
      schema,
      command,
      options,
      versions,
    })
    runner.command = parsedCommand || command
    runner.options = parsedOptions || options
    if (helpPrinted || versionPrinted) {
      return
    }
  }

  let runnerResult, runnerError
  try {
    progressMain.remove()
    runnerResult = await runner.run()
  } catch (error) {
    runnerError = error
  }

  // Save service state
  if (runner?.state && runnerResult?.state) {
    const progress = progressMain.get('state')
    progress.notice('Saving state')
    await runner.state.putServiceState({
      serviceUniqueId: runnerResult?.serviceUniqueId,
      runnerType: runner.constructor.runnerType,
      value: JSON.stringify(runnerResult.state),
    })
    progress.remove()
  }

  const notificationLogger = log.get('core:notifications')
  try {
    const notifications = runner?.getNotificationsToLog?.()
    if (notifications?.length && !runnerError) {
      await logDeferredNotifications(notifications)
    }
  } catch (error) {
    notificationLogger.debug(
      'Deferred notification logging error:',
      error?.message || error,
    )
  }

  try {
    await finalize({
      logger,
      versionFramework: versions?.serverless_framework,
      command,
      options,
      resolverManager,
      compose,
      configData: {
        config,
        configFilePath,
        configFileRaw,
      },
      runnerData: {
        runner,
        runnerResult,
        runnerError,
      },
    })
  } catch (error) {
    // Send analysis event with error
    await handleFinalizationError({
      versionFramework: versions?.serverless_framework,
      command,
      options,
      configFilePath,
      resolverManager,
      authenticatedData: runner?.authenticatedData,
      runner,
      error,
      compose,
    })
    // Swallow the finalization error
  }

  if (runnerError) throw runnerError
  return { runnerType: runner.constructor.runnerType, ...runnerResult }
}

/**
 * Finds the appropriate runner for a given custom configuration file path.
 *
 * This function reads a configuration file from the specified path, iterates through
 * available runner classes, and determines which runner should handle the configuration
 * based on its `shouldRun` method.
 *
 * @param {Object} params - The parameters for the function.
 * @returns {Promise<FindRunnerResult>} A promise resolving to a `FindRunnerResult` object.
 */
const findRunnerForCustomConfigName = async ({
  logger,
  options,
  workingDir,
}) => {
  for (const RunnerClass of runners) {
    // Ensure configFileNames is a callable function
    if (typeof RunnerClass.customConfigFilePath !== 'function') {
      logger.debug(
        `${RunnerClass.name} does not define customConfigFilePath as a function, skipping`,
      )
      continue
    }

    try {
      const customConfigFilePath = await RunnerClass.customConfigFilePath({
        options,
      })

      if (!customConfigFilePath) continue

      const configFilePath = path.resolve(workingDir, customConfigFilePath)
      const config = await readConfig(configFilePath)
      if (await RunnerClass.shouldRun({ config, configFilePath })) {
        return {
          RunnerClass,
          config,
          configFilePath: configFilePath,
        }
      }
    } catch (error) {
      logger.debug(
        `Error while fetching configFileNames for ${RunnerClass.name}: ${error.message}`,
      )
    }
  }
}

/**
 * Finds the appropriate runner for a default configuration file in the current directory.
 *
 * This function scans the current working directory for files matching prefixes defined
 * in the `configFileNames` property of available runner classes. It reads the configuration
 * file and returns the corresponding runner class if a match is found.
 *
 * @param {Object} params - The parameters for the function.
 * @param {Object} params.logger - A logger instance for logging debug information.
 * @returns {Promise<FindRunnerResult | null>} A promise resolving to a `RunnerResult` object or `null` if no runner is found.
 */
const findRunnerForDefaultConfigName = async ({ logger, workingDir }) => {
  // Read directory contents and filter out directories
  const files = (await readdir(workingDir, { withFileTypes: true }))
    .filter((dirent) => dirent.isFile()) // Keep only files
    .map((dirent) => dirent.name) // Extract file names

  for (const RunnerClass of runners) {
    if (
      !RunnerClass.configFileNames ||
      !Array.isArray(RunnerClass.configFileNames)
    ) {
      logger.debug(
        `${RunnerClass} does not define configFileNames or is invalid, skipping`,
      )
      continue
    }

    for (const configFileName of RunnerClass.configFileNames) {
      const matchedFile = files.find((file) => {
        const fileNameWithoutExt = path.basename(file, path.extname(file))
        return fileNameWithoutExt === configFileName
      })
      if (!matchedFile) {
        continue
      }
      const configPath = path.resolve(workingDir, matchedFile)
      const config = await readConfig(configPath)
      return { RunnerClass, config, configFilePath: configPath }
    }
  }

  return null
}

/**
 * @typedef {Object} FindRunnerResult
 * @property {string} configFilePath - The path to the configuration file.
 * @property {typeof Runner} RunnerClass - The runner class selected to handle the configuration.
 * @property {Object} config - The parsed configuration object.
 */

/**
 * Finds the appropriate runner based on a custom configuration file path or default settings.
 *
 * If a `customConfigFilePath` is provided, this function delegates to
 * `findRunnerForCustomConfigName` to locate a runner for the custom configuration.
 * Otherwise, it uses `findRunnerForDefaultConfigName` to search for a default configuration.
 *
 * @param {Object} params - The parameters for the function.
 * @param {Object} params.logger - A logger instance for logging debug information.
 * @returns {Promise<FindRunnerResult & { configFileRaw: string } | null>} A promise resolving to a `RunnerResult` object or `null` if no runner is found.
 */
const findRunner = async ({ logger, options, workingDir = process.cwd() }) => {
  let result = await findRunnerForCustomConfigName({
    logger,
    options,
    workingDir,
  })
  if (!result) {
    result = await findRunnerForDefaultConfigName({ logger, workingDir })
  }
  if (!result) {
    return null
  }
  const configFileRaw = await readFile(
    path.resolve(workingDir, result.configFilePath),
  )
  return { ...result, configFileRaw }
}

/**
 * Creates a usage event for a Serverless service.
 *
 * @param {string[]} command - The command executed as part of the Serverless action.
 * @param {string} versionFramework - The version of the Serverless Framework being used.
 * @param {string} serviceUniqueId - A unique identifier for the Serverless service.
 * @param {Object} details - Additional details to include in the usage event.
 * @returns {Object} - The usage event object.
 */
const createUsageEvent = ({
  command,
  versionFramework,
  serviceUniqueId,
  details,
}) => {
  return {
    source: `serverless@${versionFramework}`,
    actionName: command ? command.join('-') : null,
    serviceUniqueId,
    ...details,
  }
}

/**
 * Creates an Analysis Event for telemetry reporting.
 *
 * @param {Object} params - Parameters for creating the analysis event.
 * @param {boolean} params.licenseKey - Indicates if a license key is used (prevents sending the event).
 * @param {string} params.orgId - Organization ID.
 * @param {string} params.versionFramework - Version of the Serverless Framework being used.
 * @param {string[]} params.command - The command executed as part of the Serverless action.
 * @param {string} params.configFileName - Name of the configuration file.
 * @param {boolean} params.isCompose - Indicates if this is within a Compose project.
 * @param {string[]} params.cliOptions - CLI options passed during execution.
 * @param {string} [params.userId] - User ID, if available.
 * @param {string[]} [params.resolvers] - Resolvers/providers used.
 * @param {string} [params.runnerType] - Type of the project.
 * @param {Error} [params.error] - Error object, if the action failed.
 * @param {Object} [params.runnerSpecificDetails] - Additional runner-specific details.
 * @param {Array} [params.notifications] - Notifications from BFF with shown status.
 * @returns {Object|null} The created analysis event or null if the license key is used.
 */
const createAnalysisEvent = ({
  licenseKey,
  orgId,
  versionFramework,
  command,
  configFileName,
  isCompose,
  userId,
  resolvers,
  runnerType,
  cliOptions,
  error,
  runnerSpecificDetails,
  notifications,
}) => {
  if (licenseKey) {
    // If a license key is used, we do not send analysis events
    return null
  }

  const analysisEvent = {
    actionSucceeded: !error,
    operatingSystem: os.platform(),
    architecture: os.arch(),
    cicd: isCICDEnvironment(),
    machineId: getMachineId(),
    orgId,
    userId,
    isCompose,
    projectType: runnerType,
    cliOptions: Object.keys(cliOptions),
    source: `serverless@${versionFramework}`,
    actionName: command ? command.join('-') : null,
    configurationFileName: configFileName,
    resolvers: Array.from(new Set(resolvers)),
    ...runnerSpecificDetails,
  }

  if (error instanceof Error) {
    analysisEvent.error = {
      name: error.name,
      message: error.message,
      stacktrace: error.stack,
      code: error.code,
      originalMessage: error.originalMessage,
      originalName: error.originalName,
    }
  }

  if (
    notifications &&
    Array.isArray(notifications) &&
    notifications.length > 0
  ) {
    analysisEvent.notifications = notifications.map((n) => ({
      id: n.id,
      message: n.message,
      shown: n.shown,
    }))
  }

  return analysisEvent
}

const getMachineId = () => {
  const networkInterfaces = os.networkInterfaces()
  const macAddresses = []
  for (const [, networkInterface] of Object.entries(networkInterfaces)) {
    for (const [, address] of networkInterface.entries()) {
      if (!address.internal && address.mac !== '00:00:00:00:00:00') {
        macAddresses.push(address.mac)
      }
    }
  }
  return createHash('md5').update(macAddresses.join('')).digest('hex')
}

export const getRunner = async ({
  logger,
  command,
  options,
  compose,
  versions,
}) => {
  let runnerDetails = await findRunner({
    logger,
    command,
    options,
    workingDir: compose?.workingDir ?? process.cwd(),
  })

  const shouldByHandledByCore =
    // onboarding
    (command?.length === 0 && !options?.help && !options?.h) ||
    // allow executing core commands in other runner contexts
    commandExist({
      schema: CoreRunner.getCliSchema(),
      command: command,
    }) ||
    // version command using option or command
    options?.version ||
    options?.v ||
    command[0] === 'version'

  if (shouldByHandledByCore) {
    runnerDetails = runnerDetails
      ? { ...runnerDetails, RunnerClass: CoreRunner }
      : { RunnerClass: CoreRunner }
  }

  if (
    // if no runner is found, use CoreRunner for help command
    !runnerDetails &&
    (command[0] === 'help' || options?.help || options?.h)
  ) {
    runnerDetails = { RunnerClass: CoreRunner }
  }

  // if no runner is found and command cannot be handled by CoreRunner
  // throw an error
  if (!runnerDetails) {
    throw new ServerlessError(
      'No configuration file found',
      ServerlessErrorCodes.general.CONFIG_FILE_NOT_FOUND,
      { stack: false },
    )
  }

  const { RunnerClass, config, configFilePath, configFileRaw } = runnerDetails

  logger.debug(`Selected runner: ${RunnerClass.name}`)
  const { manager: resolverManager, stage } =
    (await variables.createResolverManager({
      options,
      serviceConfigFile: config,
      configFileDirPath: configFilePath && path.dirname(configFilePath),
      existingResolverProviders: compose?.resolverProviders,
      existingParams: compose?.params,
      loadAllResolvers: RunnerClass.name === 'ComposeRunner',
      print: command?.[0] === 'print' && !!options?.debug,
      versionFramework: versions?.serverless_framework,
    })) || {}

  const runner = new RunnerClass({
    versionFramework: versions?.serverless_framework,
    logger: log.get(RunnerClass.name),
    command,
    options,
    config,
    configFilePath,
    stage,
    resolverManager,
    compose,
  })

  return { runner, resolverManager, configFilePath, config, configFileRaw }
}

/**
 * Finalizes the command execution by sending usage and analysis events,
 * saving service state, and saving meta information.
 * If the runner is not a `CoreRunner` and no authenticated data is found in the runner result, an error is thrown.
 * is thrown.
 *
 * @param logger
 * @param versionFramework
 * @param command
 * @param options
 * @param resolverManager
 * @param compose
 * @param configData
 * @param configData.config
 * @param configData.configFilePath
 * @param configData.configFileRaw
 * @param runnerData
 * @param runnerData.runner
 * @param runnerData.runnerResult
 * @param runnerData.runnerError
 * @returns {Promise<void>}
 */
const finalize = async ({
  logger,
  versionFramework,
  command,
  options,
  resolverManager,
  compose,
  configData: { config, configFilePath, configFileRaw },
  runnerData: { runner, runnerResult, runnerError },
}) => {
  const progressMain = progress.get('main')
  progressMain.notice('Finalizing')

  const authenticatedData = runner?.authenticatedData
  const orgId = authenticatedData?.orgId
  const accessKey =
    authenticatedData?.accessKeyV1 || authenticatedData?.accessKeyV2

  const tasks = []

  // Task 1: Save deployment (if deploymentEvent exists)
  tasks.push(
    sendDeploymentEvent({
      runner,
      command,
      configFileRaw,
      configFilePath,
      versionFramework,
      orgId,
      authenticatedData,
      runnerError,
      accessKey,
    }),
  )
  // Task 2: Publish usage and analysis events
  tasks.push(
    sendAnalysisAndUsageEvent({
      authenticatedData,
      orgId,
      versionFramework,
      command,
      configFilePath,
      runner,
      compose,
      resolverManager,
      options,
      runnerError,
      runnerResult,
      accessKey,
    }),
  )
  // Task 3: Save meta information
  tasks.push(
    saveMeta({
      logger,
      metaObject: {
        versionFramework,
        servicePath: configFilePath,
        serviceConfigFileName: configFilePath && path.basename(configFilePath),
        service: config,
        provider: config?.provider,
        dashboard: authenticatedData?.dashboard,
        isWithinCompose: compose?.isWithinCompose,
        composeOrgName: compose?.orgName,
        error: runnerError,
        serviceRawFile: configFileRaw,
        command,
        options,
        orgId,
        orgName: authenticatedData?.orgName,
        userId: authenticatedData?.userId,
        userName: authenticatedData?.userName,
        ...(await runner.getMetadataToSave()),
      },
    }),
  )

  // Execute the specified tasks in parallel
  const results = await Promise.allSettled(tasks)

  let errors = []
  // Print all errors
  results.forEach((result) => {
    if (result.status === 'rejected') {
      const errorMessage = result.reason?.message || String(result.reason)
      logger.debug(`Finalization failed:`, errorMessage)
      errors.push(errorMessage)
    }
  })

  if (errors.length > 0) {
    throw new Error(`Sending events failed: ${errors.join('\n')}`)
  }
}

const handleFinalizationError = async ({
  versionFramework,
  command,
  options,
  configFilePath,
  resolverManager,
  authenticatedData,
  runner,
  error,
  compose,
}) => {
  const logger = log.get('core:router:finalization-error-handler')
  try {
    logger.debug('Error during finalization:', error)
    const analysisEvent = createAnalysisEvent({
      licenseKey: authenticatedData?.accessKeyV2,
      orgId: authenticatedData?.orgId,
      versionFramework,
      command,
      configFileName: configFilePath && path.basename(configFilePath),
      isCompose:
        runner.constructor.name === 'ComposeRunner' ||
        compose?.isWithinCompose ||
        false,
      userId: authenticatedData?.userId,
      resolvers: resolverManager?.providersUsed,
      runnerType: runner.constructor.runnerType,
      cliOptions: options,
      error,
      runnerSpecificDetails: runner.getAnalysisEventDetails(),
      notifications: authenticatedData?.notifications,
    })
    if (analysisEvent) {
      platformEventClient.addToPublishBatch({
        source: 'sfcore.analysis.generated.v1',
        event: analysisEvent,
      })
    }
    await platformEventClient.publishEventBatches({
      accessKey: authenticatedData?.accessKeyV1,
      versionFramework,
    })
  } catch (telemetryError) {
    logger.debug(
      `Error during telemetry event handling: ${telemetryError.message}`,
    )
  }
}

async function sendDeploymentEvent({
  runner,
  command,
  configFileRaw,
  configFilePath,
  versionFramework,
  orgId,
  authenticatedData,
  runnerError,
  accessKey,
}) {
  const deploymentEvent = await runner.getDeploymentEventDetails()

  if (!deploymentEvent) {
    return // Exit early if no deployment event details are available
  }

  if (!orgId) {
    log
      .get('core:router:deployment-event')
      .debug('Skipping deployment event publish because orgId is missing.')
    return
  }

  await addCommonDeploymentData({
    command,
    deploymentInstance: deploymentEvent,
    serviceRawFile: configFileRaw,
    serviceConfigFileName: configFilePath && path.basename(configFilePath),
    versionFramework,
    orgId,
    orgName: authenticatedData?.orgName,
    error: runnerError,
  })

  try {
    await saveDeployment({
      accessKey,
      deploymentInstance: deploymentEvent,
    })
  } catch (error) {
    throw new Error(`Error saving deployment: ${error.message}`)
  }
}

async function sendAnalysisAndUsageEvent({
  authenticatedData,
  orgId,
  versionFramework,
  command,
  configFilePath,
  runner,
  compose,
  resolverManager,
  options,
  runnerError,
  runnerResult,
  accessKey,
}) {
  // Create analysis event
  const analysisEvent = createAnalysisEvent({
    licenseKey: authenticatedData?.accessKeyV2,
    orgId,
    versionFramework,
    command,
    configFileName: configFilePath && path.basename(configFilePath),
    isCompose:
      runner.constructor.name === 'ComposeRunner' ||
      compose?.isWithinCompose ||
      false,
    userId: authenticatedData?.userId,
    resolvers: resolverManager?.providersUsed,
    runnerType: runner.constructor.runnerType,
    cliOptions: options,
    error: runnerError,
    runnerSpecificDetails: runner.getAnalysisEventDetails(),
    notifications: authenticatedData?.notifications,
  })

  if (analysisEvent) {
    platformEventClient.addToPublishBatch({
      source: 'sfcore.analysis.generated.v1',
      event: analysisEvent,
    })
  }

  // Create usage event if no error
  if (!runnerError) {
    // Ensure authenticated data is available
    if (!authenticatedData && runner.constructor.name !== 'CoreRunner') {
      throw new ServerlessError(
        'No authenticated data found',
        ServerlessErrorCodes.general.AUTH_FAILED,
      )
    }

    const serviceUniqueId = runnerResult?.serviceUniqueId
    if (runner.constructor.name !== 'CoreRunner' && serviceUniqueId) {
      // Create usage event
      const usageEvent = createUsageEvent({
        command,
        versionFramework,
        serviceUniqueId,
        details: await runner.getUsageEventDetails(),
      })
      instanceUsageTrackingClient.trackUsage(usageEvent)
    }
  }

  // Publish events
  try {
    let user

    if (authenticatedData?.userName) {
      user = `user:${authenticatedData?.userName}`
    }

    if (authenticatedData?.accessKeyV2Label) {
      user = `license:${authenticatedData?.accessKeyV2Label}`
    }

    await instanceUsageTrackingClient.publishEventBatches({
      orgId,
      accessKey,
      user,
      versionFramework,
    })
  } catch (error) {
    throw new Error(
      `Error publishing telemetry event batches: ${error.message}`,
    )
  }
}

export { route }
