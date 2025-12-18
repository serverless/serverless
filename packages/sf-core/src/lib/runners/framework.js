import _ from 'lodash'
import frameworkCommandsSchema from '@serverless/framework/lib/cli/commands-schema.js'
import Serverless from '@serverless/framework'
import resolveInputFinal from '@serverless/framework/lib/cli/resolve-input-final.js'
import ensureSupportedCommand from '@serverless/framework/lib/cli/ensure-supported-command.js'
import renderGeneralHelp from '@serverless/framework/lib/cli/render-help/general.js'
import renderCommandHelp from '@serverless/framework/lib/cli/render-help/command.js'
import { AwsCloudformationService } from '@serverless/engine/src/lib/aws/cloudformation.js'
import { getAwsCredentialProvider } from '../../utils/index.js'
import {
  log,
  progress,
  ServerlessError,
  ServerlessErrorCodes,
} from '@serverless/util'
import { providerRegistry } from '../resolvers/registry/index.js'
import { convertPluginToResolverProvider } from '../resolvers/providers.js'
import { Runner } from './index.js'
import { configureLocalstackAWSEndpoint } from '../../utils/local/localstack.js'
import path from 'path'
import Esbuild from '@serverless/framework/lib/plugins/esbuild/index.js'
import { Deployment } from '../platform/deployments.js'

export class TraditionalRunner extends Runner {
  constructor({
    versionFramework,
    command,
    options,
    config,
    configFilePath,
    stage,
    resolverManager,
    compose,
  }) {
    super({
      versionFramework,
      command,
      options,
      config,
      configFilePath,
      stage,
      resolverManager,
      compose,
    })
  }

  static configFileNames = ['serverless']
  static runnerType = 'traditional'

  static async shouldRun({ config }) {
    return !!config.service
  }

  static async customConfigFilePath({ options }) {
    return options.config || options.c
  }

  serviceUniqueId
  awsCfStack
  integrations
  compiledCloudFormationTemplate
  coreCloudFormationTemplate
  getAwsDeploymentCredentials

  async run() {
    const logger = log.get('traditional')

    configureLocalstackAWSEndpoint({
      config: this.config,
      stage: this.stage,
    })

    const commandSchema = frameworkCommandsSchema.get(this.command.join(' '))
    convertOptionShortcutsToFullNames(
      this.options,
      commandSchema,
      frameworkCommandsSchema,
    )

    // Authenticate
    const authenticatedData = await this.resolveVariablesAndAuthenticate()

    // Resolve the variables in the template file
    await this.resolveVariables({ printResolvedVariables: true })

    // Get the AWS deployment credential provider
    const { region, resolveCredentials } = await this.getAwsCredentialProvider()

    let serviceUniqueId = (
      await this.getServiceUniqueId().catch((err) => {
        logger.debug('error getting service unique id', err)
        return { serviceUniqueId: null }
      })
    )?.serviceUniqueId

    // Run the command
    const {
      state,
      integrations,
      compiledCloudFormationTemplate,
      coreCloudFormationTemplate,
    } = await runFramework({
      accessKeyV1: authenticatedData.accessKeyV1,
      accessKeyV2: authenticatedData.accessKeyV2,
      version: this.versionFramework,
      service: this.config,
      command: this.command,
      options: this.options,
      stage: this.stage,
      servicePath: path.dirname(this.configFilePath),
      serviceConfigFileName: path.parse(this.configFilePath).name,
      serviceProviderAwsProvider: resolveCredentials,
      serviceProviderAwsRegion: region,
      orgName: authenticatedData.orgName,
      orgId: authenticatedData.orgId,
      resolversManager: this.resolverManager,
      composeServiceParams: this.compose?.serviceParams,
      isWithinCompose: this.compose?.isWithinCompose,
      composeOrgName: this.compose?.orgName,
    })

    this.integrations = integrations
    this.compiledCloudFormationTemplate = compiledCloudFormationTemplate
    this.coreCloudFormationTemplate = coreCloudFormationTemplate

    if (!serviceUniqueId) {
      serviceUniqueId = (
        await this.getServiceUniqueId().catch((err) => {
          logger.debug('error getting service unique id', err)
          return { serviceUniqueId: null }
        })
      )?.serviceUniqueId
    }

    return {
      authenticatedData,
      state,
      serviceUniqueId,
    }
  }

  async getAwsCredentialProvider() {
    const { region, resolveCredentials } = await getAwsCredentialProvider({
      awsProfile:
        this.options?.['aws-profile'] ?? this.config?.provider?.profile,
      providerAwsAccessKeyId:
        this.authenticatedData?.dashboard?.serviceProvider?.accessKeyId,
      providerAwsSecretAccessKey:
        this.authenticatedData?.dashboard?.serviceProvider?.secretAccessKey,
      providerAwsSessionToken:
        this.authenticatedData?.dashboard?.serviceProvider?.sessionToken,
      resolversManager: this.resolverManager,
    })
    this.getAwsDeploymentCredentials = resolveCredentials
    return { region, resolveCredentials }
  }

  async getServiceUniqueId() {
    if (!this.authenticatedData) {
      await this.resolveVariablesAndAuthenticate()
    }
    await this.resolveVariables()
    if (!this.getAwsDeploymentCredentials) {
      await this.getAwsCredentialProvider()
    }
    const credentials = this.getAwsDeploymentCredentials
      ? await this.getAwsDeploymentCredentials()
      : null

    const p = progress.get('resolve-service-unique-id')
    p.notice('Loading service details')

    try {
      const stackName = getStackName({
        config: this.config,
        stage: this.stage,
      })

      const { stackId, timeCreated, timeUpdated, status, outputs } =
        await getStackInfo({
          stackName,
          region: credentials?.region,
          credentials,
        })

      if (!stackId) {
        throw new Error(`Stack ${stackName} does not exist`)
      }

      this.serviceUniqueId = stackId
      this.awsCfStack = {
        stackId,
        stackName,
        timeCreated,
        timeUpdated,
        status,
        outputs,
      }
      return { serviceUniqueId: stackId }
    } finally {
      p.remove()
    }
  }

  async getUsageEventDetails() {
    const credentials = this.getAwsDeploymentCredentials
      ? await this.getAwsDeploymentCredentials()
      : null

    return {
      service: {
        awsAccountId: credentials?.accountId || null,
        serviceName: this.config?.service || null,
        regionName: this.config?.provider?.region || null,
        stageName: this.stage || null,
        appName: this.config?.app || null,
      },
      awsCfStack: {
        awsCfStackId: this.awsCfStack?.stackId,
        timeCreated: this.awsCfStack?.timeCreated,
        timeUpdated: this.awsCfStack?.timeUpdated,
      },
    }
  }

  getAnalysisEventDetails() {
    const details = {
      providerRuntime: this.config.provider?.runtime,
      awsCfStackId: this.serviceUniqueId,
      isEsbuildEnabled: Esbuild.WillEsBuildRun(
        this.config,
        this.configFilePath,
      ),
      integrations: this.integrations,
    }

    // plugins
    if (
      Array.isArray(this.config?.plugins) ||
      (Array.isArray(this.config?.plugins?.modules) && // If plugins is an object, it must have a modules array
        (!this.config?.plugins?.localPath || // localPath is optional but if it exists, it must be a string
          typeof this.config?.plugins?.localPath === 'string'))
    ) {
      details.plugins = this.config.plugins
    }

    // runtimes
    const functionRuntimes = Object.entries(this.config?.functions || {})
      .map(([, functionObject]) => {
        if (functionObject.runtime) {
          return functionObject.runtime
        }
        return undefined
      })
      .filter((runtime) => runtime !== undefined)
    if (functionRuntimes.length > 0) {
      details.runtimes = Array.from(new Set(functionRuntimes))
    }

    return details
  }

  async getDeploymentEventDetails() {
    if (
      isDashboardEnabledForService(this.config) &&
      (this.command[0] === 'deploy' || this.command[0] === 'remove')
    ) {
      const credentials = this.getAwsDeploymentCredentials
        ? await this.getAwsDeploymentCredentials()
        : null

      return createServiceDeployment({
        service: this.config,
        stage: this.stage,
        areProvidersUsed: !!this.authenticatedData?.dashboard?.serviceProvider,
        serviceAppId: this.authenticatedData?.dashboard?.serviceAppId,
        awsAccountId: credentials?.accountId,
        awsRegion: credentials?.region,
        awsCfStackId: this.awsCfStack?.stackId,
        awsCfStackCreated: this.awsCfStack?.timeCreated,
        awsCfStackUpdated: this.awsCfStack?.timeUpdated,
        awsCfStackStatus: this.awsCfStack?.status,
        awsCfStackOutputs: this.awsCfStack?.outputs,
      })
    }
  }

  async getMetadataToSave() {
    const credentials = this.getAwsDeploymentCredentials
      ? await this.getAwsDeploymentCredentials()
      : null

    return {
      serviceProviderAwsAccountId: credentials?.accountId,
      serviceProviderAwsCfStackName: this.awsCfStack?.stackName,
      serviceProviderAwsCfStackId: this.awsCfStack?.stackId,
      serviceProviderAwsCfStackCreated: this.awsCfStack?.timeCreated,
      serviceProviderAwsCfStackUpdated: this.awsCfStack?.timeUpdated,
      serviceProviderAwsCfStackStatus: this.awsCfStack?.status,
      serviceProviderAwsCfStackOutputs: this.awsCfStack?.outputs,
      compiledCloudFormationTemplate: this.compiledCloudFormationTemplate,
      coreCloudFormationTemplate: this.coreCloudFormationTemplate,
    }
  }
}

const isDashboardEnabledForService = (config) => {
  return (
    config?.org &&
    typeof config?.org === 'string' &&
    config?.app &&
    typeof config?.app === 'string' &&
    config?.service &&
    typeof config?.service === 'string'
  )
}

const runFramework = async ({
  service,
  options,
  stage,
  servicePath,
  serviceProviderAwsProvider,
  serviceProviderAwsRegion,
  composeServiceParams,
  isWithinCompose,
  composeOrgName,
  command,
  accessKeyV1,
  accessKeyV2,
  orgName,
  orgId,
  serviceConfigFileName,
  version,
  resolversManager,
}) => {
  const logger = log.get('core:runner:sls')
  let state
  logger.debug({
    service: summarizeServiceForLog(service),
    options,
    stage,
    servicePath,
    serviceProviderAwsProvider,
    serviceProviderAwsRegion,
    composeServiceParams,
    isWithinCompose,
    composeOrgName,
    command,
    accessKey: maskKeyForLog(accessKeyV1),
    licenseKey: maskKeyForLog(accessKeyV2),
    orgName,
    orgId,
    serviceConfigFileName,
  })

  /**
   * Check to see if the Service exists
   */
  if (!service) {
    const err = new ServerlessError(
      `No Service configuration file (e.g. serverless.yml) was found in "${servicePath}"`,
      ServerlessErrorCodes.framework.FRAMEWORK_CONFIG_NOT_FOUND,
    )
    err.stack = undefined
    throw err
  }

  /**
   * Ensure "provider" is an object.
   * Ensure "provider.name" is "aws".
   * Ensure "provider.name" is not a Serverless Framework Variable.
   */
  if (!_.isObject(service.provider)) {
    service.provider = { name: 'aws' }
  }
  if (service.provider.name !== 'aws') {
    if (service.provider?.name?.startsWith('${')) {
      const err = new ServerlessError(
        'Serverless Framework Variables are not supported for "provider.name".',
        ServerlessErrorCodes.framework.FRAMEWORK_VARIABLES_NOT_SUPPORTED_FOR_PROVIDER,
      )
      err.stack = undefined
      throw err
    } else {
      const err = new ServerlessError(
        'Serverless Framework V.4 only supports "aws" as a Provider. Please look into Extensions for a better multi-Provider experience.',
        ServerlessErrorCodes.framework.FRAMEWORK_UNSUPPORTED_PROVIDER,
      )
      err.stack = undefined
      throw err
    }
  }

  /**
   * Serverless Framework Variable Resolution does not overwrite
   * the "stage" if provided via options. However, the Framework later
   * DOES overwrite anything in the config with the "stage" option.
   * This overwriting is still in the Framework, but let's also
   * resolve it here.
   *
   * This shouldn't affect fallback variables, since the
   * stage option is not added unless it exists.
   */
  service.provider.stage = stage

  /**
   * Remove Service "params" for other stages than the current one
   * or "default" from serverless.yml. This prevents the Framework
   * from trying to resolve variables that are not available.
   * https://github.com/serverless/serverless/issues/12086
   */
  if (service.params) {
    for (const [key] of Object.entries(service.params)) {
      if (key !== stage && key !== 'default') {
        delete service.params[key]
      }
    }
  }

  /**
   * Serverless Framework might be running within a broader Compose
   * operation. If an "org" is defined within the Compose config,
   * then we need to ensure that the "org" is set within the Service,
   * and that it matches the Compose "org" name.
   * This is the ideal time to do this, since we have the "org" value.
   */
  if (isWithinCompose) {
    if (command[0] === 'remove') {
      service.configValidationMode = 'off'
    }
    // Ensure "org" is set within the Compose file, if it's set within the Service
    if (!composeOrgName && service.org) {
      // Suppress configuration schema errors when running the 'remove' command within Compose
      // because the Compose service parameters are not available during the 'remove' command
      // as there's no Compose service to resolve them from
      const err = new ServerlessError(
        'Your Service has an "org" property, but the Compose config does not. Please ensure that the "org" property is set within the Compose config and it matches all Services run with Compose.',
        ServerlessErrorCodes.compose.COMPOSE_ORG_PROPERTY_MISSING,
      )
      err.stack = undefined
      throw err
    }
    // If "org" is set within the Compose file, ensure it matches the Service
    if (composeOrgName && service.org && composeOrgName !== service.org) {
      const err = new ServerlessError(
        'The "org" defined in the Service does not match the "org" used in your Compose operation.\n\nYou may have a different "org" specified in your Compose configuration file, or you may have a default Org on your machine that does not match the one in this Service, or you may authenticated with a user or license key associated with a different Org.\n\nTo resolve this, ensure that the "org" property is set within the Compose config and it matches all Services run with Compose.',
        ServerlessErrorCodes.framework.MISMATCHED_COMPOSE_FRAMEWORK_ORG,
      )
      err.stack = undefined
      throw err
    }
    // Otherwise, set the "org" within the Service to match the Compose file
    if (composeOrgName && !service.org) {
      service.org = composeOrgName
    }
  }

  // Assign resolved params to unresolved composeServiceParams
  Object.keys(composeServiceParams || {}).forEach((key) => {
    if (resolversManager.composeParams[key] !== undefined) {
      composeServiceParams[key] = resolversManager.composeParams[key]
    }
  })

  const serverless = new Serverless({
    version,
    orgId,
    orgName,
    accessKey: accessKeyV1 || accessKeyV2,
    servicePath,
    serviceConfigFileName,
    service,
    commands: command,
    options,
    credentialProviders: { aws: serviceProviderAwsProvider },
    region: serviceProviderAwsRegion,
    compose: {
      serviceParams: composeServiceParams,
      isWithinCompose,
    },
    instanceId: await resolversManager.resolveVariableOnce('sls:instanceId'),
  })

  await serverless.init()

  await resolvePluginVariables(
    resolversManager,
    serverless.pluginManager?.externalPlugins,
  )

  /**
   * Resolve the full command schema
   *
   * If Plugins are loaded, update the commands schema to include any
   * that plugins may have added. Also, get a specific command schema.
   */
  const fullCommand = command.join(' ')

  let resolvedCommandsSchema = frameworkCommandsSchema

  if (serverless.pluginManager.externalPlugins.size) {
    resolvedCommandsSchema = resolveInputFinal(
      serverless.pluginManager.externalPlugins,
      { providerName: service.provider.name },
    )
  }

  const resolvedCommandSchema = resolvedCommandsSchema.get(fullCommand)

  convertOptionShortcutsToFullNames(
    options,
    resolvedCommandSchema,
    resolvedCommandsSchema,
  )

  serverless.processedInput.commands = serverless.pluginManager.cliCommands =
    command
  serverless.processedInput.options = options
  Object.assign(serverless.pluginManager.cliOptions, options)

  if (
    renderHelpCommand(
      command,
      options,
      serverless,
      resolvedCommandsSchema,
      version,
    )
  ) {
    return {}
  }

  ensureSupportedCommand({
    command: fullCommand,
    options,
    commandSchema: resolvedCommandSchema,
    commandsSchema: resolvedCommandsSchema,
  })

  await serverless.run()

  state = serverless.stackOutputs ? { outputs: serverless.stackOutputs } : {}
  if (fullCommand === 'remove') {
    state = {}
  }
  return {
    state,
    integrations: serverless.integrations,
    compiledCloudFormationTemplate:
      serverless.service?.provider?.compiledCloudFormationTemplate,
    coreCloudFormationTemplate:
      serverless.service?.provider?.coreCloudFormationTemplate,
  }
}

/**
 * Render Help Command
 *
 * @param {Object} command - The command object.
 * @param {Object} options - The options object.
 * @param {Object} serverless - The serverless instance.
 * @param {Object} resolvedCommandsSchema - The resolved commands schema.
 * @param {string} version - The version of the Serverless Framework.
 */
function renderHelpCommand(
  command,
  options,
  serverless,
  resolvedCommandsSchema,
  version,
) {
  if (command[0] === 'help' || (!command[0] && (options.help || options.h))) {
    renderGeneralHelp({
      loadedPlugins: serverless.pluginManager.externalPlugins,
      commandsSchema: resolvedCommandsSchema,
      version,
    })
    return true
  } else if (
    command[0] &&
    command[0] !== 'help' &&
    (options.help || options.h)
  ) {
    renderCommandHelp({
      commandName: command.join(' '),
      commandsSchema: resolvedCommandsSchema,
    })
    return true
  }
  return false
}

/**
 * Registers the resolver providers from the external plugins and resolves the placeholders in the config.
 *
 * @param {Object} resolversManager - The resolver manager.
 * @param {Set} plugins - The array of external plugins.
 * @throws {ServerlessError} If the resolver manager is not found.
 * @returns {Promise} A promise that resolves when placeholders in the config have been replaced.
 */
const resolvePluginVariables = async (resolversManager, plugins) => {
  if (!resolversManager) {
    throw new ServerlessError(
      'Resolver Manager not found.',
      ServerlessErrorCodes.framework.RESOLVER_MANAGER_NOT_FOUND,
    )
  }
  if (!plugins) {
    return
  }
  plugins.forEach((plugin) => {
    for (const source in plugin.configurationVariablesSources) {
      const resolverProvider = convertPluginToResolverProvider(
        plugin.constructor?.name,
        source,
        plugin.configurationVariablesSources[source].resolve,
      )
      providerRegistry.register(source, resolverProvider)
    }
  })
  // Resolve all placeholders in the config
  // using the registered resolver providers from the external plugins
  await resolversManager.resolveAndReplacePlaceholdersInConfig()
  // Plugins can add new configuration properties or modify existing ones using the "serverless.extendConfiguration" method.
  // The placeholders in the new or modified configuration properties need to be resolved
  // after the placeholders in the original configuration have been resolved.
  await resolversManager.loadPlaceholders()
  await resolversManager.resolveAndReplacePlaceholdersInConfig()
}

const getStackName = ({ config, stage }) => {
  if (
    config?.provider?.stackName &&
    typeof config.provider.stackName === 'string'
  ) {
    return config.provider.stackName
  }
  return `${config.service}-${stage}`
}

const getStackInfo = async ({ stackName, region, credentials }) => {
  const awsCloudformation = new AwsCloudformationService({
    region,
    credentials,
  })
  const awsStackInfo = await awsCloudformation.describeStack(stackName)
  return {
    stackId: awsStackInfo?.StackId,
    stackName: awsStackInfo?.StackName,
    timeCreated: awsStackInfo?.CreationTime?.toISOString(),
    timeUpdated: awsStackInfo?.LastUpdatedTime?.toISOString(),
    status: awsStackInfo?.StackStatus,
    outputs: awsStackInfo?.Outputs,
  }
}

/**
 * Convert Option shortcuts/aliases to full Option names
 *
 * Look at the Command Schema to map shortcuts to full names.
 * If not found, look at the Common Options Schema, which declares
 * global options that are available to all commands, and try
 * to map those shortcuts to a full name.
 *
 * @param {Object} options - The options object.
 * @param {Object} resolvedCommandSchema - The resolved command schema.
 * @param {Object} resolvedCommandsSchema - The resolved commands schema.
 */
function convertOptionShortcutsToFullNames(
  options,
  resolvedCommandSchema,
  resolvedCommandsSchema,
) {
  if (!options) return
  /**
   * Look at the Command Schema to map shortcuts to full names.
   * If not found, look at the Common Options Schema, which declares
   * global options that are available to all commands, and try
   * to map those shortcuts to a full name.
   */
  for (const [optionName] of Object.entries(options)) {
    if (resolvedCommandSchema) {
      // Loop over the commandSchema.options to check if the option name matches a shortcut
      for (const [schemaOptionName, schemaOptionDetails] of Object.entries(
        resolvedCommandSchema.options,
      )) {
        if (schemaOptionDetails.shortcut === optionName) {
          options[schemaOptionName] = options[optionName]
          delete options[optionName]
          break // Exit the loop early as we've found a matching shortcut
        }
      }
    }
    // Do the same for common options
    if (resolvedCommandsSchema.commonOptions) {
      for (const [schemaOptionName, schemaOptionDetails] of Object.entries(
        resolvedCommandsSchema.commonOptions,
      )) {
        if (
          schemaOptionDetails.shortcut === optionName &&
          // Ensure the option hasn't already been set by the command schema
          options[optionName] !== undefined
        ) {
          options[schemaOptionName] = options[optionName]
          delete options[optionName]
          break // Exit the loop early as we've found a matching shortcut
        }
      }
    }
  }
}

/**
 * Create a service deployment object
 */
const createServiceDeployment = ({
  service,
  stage,
  areProvidersUsed,
  serviceAppId,
  awsAccountId,
  awsRegion,
  awsCfStackId,
  awsCfStackCreated,
  awsCfStackUpdated,
  awsCfStackStatus,
  awsCfStackOutputs,
}) => {
  const logger = log.get('core:platform:deployments')
  logger.debug('creating service deployment record for the serverless platform')

  // Create deployment instance
  const deploymentInstance = new Deployment()

  /**
   * Set & Save Initial Deployment Data
   */
  const deployment = {}
  deployment.appUid = serviceAppId || null
  deployment.appName = service?.app || null
  deployment.serviceName = service?.service || null
  deployment.stageName = stage || null
  deployment.regionName = awsRegion || null
  deployment.logsRoleArn = null
  deployment.provider = {}
  deployment.provider.type = service?.provider?.name
  if (deployment.provider.type === 'aws') {
    deployment.provider.aws = {}
    deployment.provider.aws.accountId = awsAccountId
  }
  deployment.layers = service?.layers || {}
  deployment.plugins = service?.plugins
    ? service?.plugins?.modules || service?.plugins
    : []
  deployment.custom = service?.custom || {}
  deployment.areProvidersUsed = areProvidersUsed

  if (awsCfStackId) {
    deployment.awsCfStack = {
      awsCfStackId: awsCfStackId,
      timeCreated: awsCfStackCreated,
      timeUpdated: awsCfStackUpdated,
      stackStatus: awsCfStackStatus,
    }
  }

  // Save initial data to deployment instance
  deploymentInstance.set(deployment)

  /**
   * Save Functions & Subscriptions (Events) to Deployment
   */
  for (const fnName of Object.keys(service.functions || {})) {
    const fn = service.functions[fnName]
    const deployedFunctionName =
      fn.name || `${service.service}-${stage}-${fnName}`
    fn.events = fn.events || []

    // Function
    deploymentInstance.setFunction({
      name: deployedFunctionName,
      description: fn.description || null,
      timeout: fn.timeout,
      type: 'awsLambda',
      arn: `arn:aws:lambda:${service.provider.region}:${awsAccountId}:function:${deployedFunctionName}`,
      custom: {
        handler: fn.handler,
        memorySize: fn.memory,
        runtime: fn.runtime,
        environment: Object.keys(fn.environment || {}),
        role: fn.role,
        onError: fn.onError,
        awsKmsKeyArn: fn.awsKmsKeyArn,
        tags: fn.tags || {},
        vpc: fn.vpc || {},
        layers: fn.layers || [],
        name: fn.name || fnName,
      },
    })

    /*
     * Add this functions's subscriptions...
     */
    for (const sub of fn.events) {
      let subDetails = {}
      let type
      if (typeof sub === 'string') {
        type = sub
      } else {
        type = Object.keys(sub)[0]
        if ((type === 'http' || type === 'httpApi') && awsCfStackOutputs) {
          const apigResource = _.find(
            awsCfStackOutputs,
            ({ OutputKey }) =>
              !OutputKey.endsWith('Websocket') &&
              OutputKey.match(/^(ServiceEndpoint|HttpApiUrl)/),
          )
          const apiId =
            apigResource &&
            apigResource.OutputValue.split('https://')[1].split('.')[0]

          if (typeof sub[type] === 'string') {
            subDetails = {
              path: sub[type].split(' ')[1],
              method: sub[type].split(' ')[0],
            }
          } else {
            subDetails = {
              path: sub[type].path,
              method: sub[type].method,
              cors: sub[type].cors,
              integration: sub[type].integration,
              authorizer: sub[type].authorizer,
              timeout: sub[type].timeout,
            }
          }
          if (type === 'http') {
            subDetails.restApiId = apiId
          } else {
            subDetails.httpApiId = apiId
          }
        } else if (sub[type] instanceof Object) {
          Object.assign(subDetails, sub[type])
        } else {
          Object.assign(subDetails, { [type]: sub[type] })
        }
        if (type === 'websocket' && awsCfStackOutputs) {
          const apigResource = _.find(
            awsCfStackOutputs,
            ({ OutputKey }) =>
              OutputKey.endsWith('Websocket') &&
              OutputKey.match(/^(ServiceEndpoint|HttpApiUrl)/),
          )
          const apiId =
            apigResource &&
            apigResource.OutputValue.split('wss://')[1].split('.')[0]
          subDetails.websocketApiId = apiId
        }
      }
      deploymentInstance.setSubscription({
        type,
        function: deployedFunctionName,
        ...subDetails,
      })
    }
  }

  /**
   * Save Outputs to Deployment
   * Fetch any Cloudformation Outputs specified as Service Outputs
   */
  const outputs = { ...service.outputs } || {}
  for (const [outputKey, outputValue] of _.entries(outputs)) {
    if (typeof outputValue === 'string' && outputValue.startsWith('CFN!?')) {
      if (awsCfStackOutputs) {
        const cfnOutput = _.find(
          awsCfStackOutputs,
          ({ OutputKey }) => OutputKey === `${outputValue.slice(5)}`,
        )
        outputs[outputKey] = cfnOutput.OutputValue
      } else {
        delete outputs[outputKey]
      }
    }
  }
  deploymentInstance.set({ outputs })

  return deploymentInstance
}

const maskKeyForLog = (value) => {
  if (typeof value !== 'string' || value.length === 0) {
    return value ?? null
  }
  const trimmed = value.trim()
  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 2)}****${trimmed.slice(-2)}`
  }
  return `${trimmed.slice(0, 4)}****${trimmed.slice(-4)}`
}

const summarizeServiceForLog = (serviceConfig) => {
  try {
    if (!serviceConfig || typeof serviceConfig !== 'object') {
      return serviceConfig ?? null
    }
    const summary = {
      service: serviceConfig.service,
      app: serviceConfig.app,
      org: serviceConfig.org,
      provider:
        serviceConfig.provider && typeof serviceConfig.provider === 'object'
          ? {
              name: serviceConfig.provider.name,
              runtime: serviceConfig.provider.runtime,
              region: serviceConfig.provider.region,
            }
          : undefined,
      frameworkVersion: serviceConfig.frameworkVersion,
      functions:
        serviceConfig.functions && typeof serviceConfig.functions === 'object'
          ? Object.keys(serviceConfig.functions)
          : undefined,
      plugins: Array.isArray(serviceConfig.plugins)
        ? serviceConfig.plugins.map((plugin) =>
            typeof plugin === 'string' ? plugin : plugin?.name,
          )
        : undefined,
      licenseKey: serviceConfig.licenseKey
        ? maskKeyForLog(serviceConfig.licenseKey)
        : undefined,
      layers:
        serviceConfig.layers && typeof serviceConfig.layers === 'object'
          ? Object.keys(serviceConfig.layers)
          : undefined,
      params:
        serviceConfig.params && typeof serviceConfig.params === 'object'
          ? Object.entries(serviceConfig.params).reduce(
              (acc, [stageName, stageParams]) => {
                acc[stageName] =
                  stageParams && typeof stageParams === 'object'
                    ? Object.keys(stageParams)
                    : stageParams
                return acc
              },
              {},
            )
          : undefined,
      custom:
        serviceConfig.custom && typeof serviceConfig.custom === 'object'
          ? Object.keys(serviceConfig.custom)
          : undefined,
      stages:
        serviceConfig.stages && typeof serviceConfig.stages === 'object'
          ? Object.entries(serviceConfig.stages).reduce(
              (acc, [stageName, stageConfig]) => {
                if (stageConfig && typeof stageConfig === 'object') {
                  acc[stageName] = Object.entries(stageConfig).reduce(
                    (stageAcc, [sectionName, sectionValue]) => {
                      stageAcc[sectionName] =
                        sectionValue && typeof sectionValue === 'object'
                          ? Object.keys(sectionValue)
                          : sectionValue
                      return stageAcc
                    },
                    {},
                  )
                } else {
                  acc[stageName] = stageConfig
                }
                return acc
              },
              {},
            )
          : undefined,
    }
    if (serviceConfig.package) {
      const packageSummary = {}
      if (serviceConfig.package.individually !== undefined) {
        packageSummary.individually = Boolean(
          serviceConfig.package.individually,
        )
      }
      if (Array.isArray(serviceConfig.package.patterns)) {
        packageSummary.patternsCount = serviceConfig.package.patterns.length
      }
      if (Array.isArray(serviceConfig.package.exclude)) {
        packageSummary.excludeCount = serviceConfig.package.exclude.length
      }
      if (Array.isArray(serviceConfig.package.include)) {
        packageSummary.includeCount = serviceConfig.package.include.length
      }
      if (Object.keys(packageSummary).length > 0) {
        summary.package = packageSummary
      }
    }
    if (serviceConfig.resources) {
      if (Array.isArray(serviceConfig.resources)) {
        summary.resources = { entries: serviceConfig.resources.length }
      } else if (typeof serviceConfig.resources === 'object') {
        summary.resources = Object.entries(serviceConfig.resources).reduce(
          (acc, [sectionName, sectionValue]) => {
            acc[sectionName] =
              sectionValue && typeof sectionValue === 'object'
                ? Object.keys(sectionValue)
                : sectionValue
            return acc
          },
          {},
        )
      }
    }
    if (serviceConfig.outputs) {
      summary.outputs = Object.keys(serviceConfig.outputs)
    }
    return summary
  } catch (error) {
    return null
  }
}
