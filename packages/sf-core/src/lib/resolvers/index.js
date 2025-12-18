import {
  ensureNoParamsAndStagesTogether,
  validateCustomResolverConfigs,
  validateResolversUniqueness,
} from './validation.js'
import { loadEnvFiles } from './env.js'
import { ResolverManager } from './manager.js'
import { table } from 'table'
import { log } from '@serverless/util'

/**
 * @typedef {Object} Replacement
 * @property {string} path - The path of the replacement.
 * @property {string} original - The original value.
 * @property {string} resolved - The resolved value.
 * @property {string} providerName - The name of the provider.
 * @property {string} providerType - The type of the provider.
 * @property {string} resolverType - The type of the resolver.
 * @property {string} key - The key of the replacement.
 */

/**
 * @typedef {Object} ResolveServiceConfigOptions
 * @property {Object} options - The options.
 * @property {string} stage - The stage.
 * @property {ResolverProvider[]} resolverProviders - The resolver providers.
 * @property {DashboardData} dashboard - The dashboard data.
 * @property {string} configFileDirPath - The directory path of the configuration file.
 * @property {Object} serviceConfigFile - The service configuration file.
 * @property {Object} composeParams - The Compose parameters.
 * @property {boolean} isCompose - Whether the operation is an operation
 * on Compose file.
 * @property {boolean} print - Whether to print the service configuration.
 * @property {Logger} logger - The logger.
 * @property {Object} meta - The metadata.
 */

/**
 * @typedef {Object} AwsCredentials
 * @property {string} accessKeyId - The AWS access key ID.
 * @property {string} secretAccessKey - The AWS secret access key.
 * @property {string} sessionToken - The AWS session token.
 * @property {string} accountId - The AWS account ID.
 */

/**
 * @typedef {Object} Credentials
 * @property {Object} aws - The AWS credentials.
 * @property {AwsCredentials} aws.credentials - The AWS credentials.
 * @property {Function} aws.provider - The AWS credential provider.
 */

/**
 * Print the result of the service configuration resolution.
 * This function is responsible for printing the resolved service configuration and the replacements.
 * @param {Logger} logger - The logger.
 * @param {Object} serviceConfigFile - The resolved service configuration file.
 * @param {Replacement[]} replacements - The replacements.
 */
export const printResult = (logger, serviceConfigFile, replacements) => {
  if (replacements.length > 0) {
    // Define table data including the placeholder for the spanning header row
    const tableData = [
      ['Path', 'Original', 'Resolved', 'Details'], // Actual table header
    ]

    // Populate the table with data rows
    replacements.forEach((obj) => {
      tableData.push([
        obj.path,
        obj.original,
        JSON.stringify(obj.resolved),
        // Combine the details into a single string, separated by newlines
        `Provider: ${obj.providerName}\nProvider Type: ${obj.providerType}\nResolver Type: ${obj.resolverType}\nKey: ${obj.key}`,
      ])
    })

    // Calculate the width for each column based on the terminal width, accounting for separators
    const numberOfColumns = tableData[0].length
    const terminalWidth = process.stdout.columns || 80 // fallback to 80 if undefined
    const separators = numberOfColumns + 10 // Add some extra space for separators
    const columnWidth = Math.floor(
      (terminalWidth - separators) / numberOfColumns,
    )

    const config = {
      columnDefault: {
        width: columnWidth,
      },
    }
    logger.notice(table(tableData, config))
  }
}

const createResolverManager = async ({
  options,
  serviceConfigFile,
  configFileDirPath,
  existingResolverProviders,
  existingParams,
  loadAllResolvers,
  print,
  versionFramework,
}) => {
  const logger = log.get('core:resolver:manager')

  if (!serviceConfigFile) {
    return null
  }

  // Ensure that params and stages are not used together
  ensureNoParamsAndStagesTogether(serviceConfigFile)
  // Validate custom resolver configurations
  validateCustomResolverConfigs(serviceConfigFile)
  // Ensure there is no duplicate resolver names
  validateResolversUniqueness(serviceConfigFile)

  const manager = new ResolverManager(
    logger,
    serviceConfigFile,
    configFileDirPath,
    options,
    existingResolverProviders,
    existingParams,
    undefined,
    print,
    versionFramework,
  )

  // Load all placeholders and providers from the service configuration file
  // and add them to the graph
  await manager.loadPlaceholders()

  // If a user does not define stage using the stage option,
  // we need to resolve the stage from provider.stage or default to 'dev'
  const stage = await manager.resolveStage()
  // Load environment variables from .env file and .env.[stage] file
  loadEnvFiles({ configFileDirPath, stage })

  // Resolve provider.resolver key
  await manager.resolveProviderResolver()
  // Determine the credential resolver name and set it
  await manager.setCredentialResolver()

  // Remove stages other than the current and default
  manager.pruneUnusedStages()

  // Again, load all placeholders and providers from the service configuration file
  // and add them to the graph, but this time with edges to the credential resolver
  await manager.loadPlaceholders()

  // Add the credential resolver to the graph to create its instance
  // during the resolution process
  await manager.addCredentialResolverToGraph()

  if (loadAllResolvers) {
    // At this point, we don't know which resolvers are needed to resolve
    // the placeholders in the Compose child service configuration files,
    // so we load all custom resolvers
    await manager.loadAllResolvers()
  }
  return { manager, stage }
}

export const variables = {
  createResolverManager,
}
