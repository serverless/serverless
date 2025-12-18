import { getAwsCredentialProvider } from '../../../utils/index.js'
import { parseComposeGraph } from './index.js'
import {
  ServerlessError,
  ServerlessErrorCodes,
  resolveStateStore,
  log,
  style,
  getGlobalRendererSettings,
  setGlobalRendererSettings,
} from '@serverless/util'
import renderComposeHelp from './help.js'
import frameworkCommandsSchema from '@serverless/framework/lib/cli/commands-schema.js'
import { Runner } from '../index.js'
import path from 'path'

const supportedComposeCommands = [
  'deploy',
  'info',
  'remove',
  'print',
  'package',
]

export class ComposeRunner extends Runner {
  constructor({
    config,
    command,
    configFilePath,
    options,
    versionFramework,
    resolverManager,
    compose,
  }) {
    super({
      config,
      configFilePath,
      command,
      options,
      versionFramework,
      resolverManager,
      compose,
    })
  }

  static configFileNames = ['serverless-compose']
  static runnerType = 'compose'

  static async shouldRun({ config }) {
    return !!config.services
  }

  static async customConfigFilePath({ options }) {
    return options.config || options.c
  }

  getCliSchema() {}

  async run() {
    const logger = log.get('compose')

    logger.info('Running Compose...')

    // Authenticate
    const authenticatedData = await this.resolveVariablesAndAuthenticate()

    // Resolve the variables in the template file
    await this.resolveVariables()

    // Get the AWS deployment credentials
    await this.getAwsCredentialProvider()

    if (this.compose?.isWithinCompose) {
      const err = new ServerlessError(
        'A Compose project cannot be run within another Compose project.',
        ServerlessErrorCodes.compose.NESTED_COMPOSE_PROJECT,
      )
      err.stack = undefined
      throw err
    }

    await runCompose({
      composeConfigFile: this.config,
      composeDirPath: path.dirname(this.configFilePath),
      versions: { serverless_framework: this.versionFramework },
      command: this.command,
      options: this.options,
      resolverProviders: this.resolverManager?.resolverProviders,
      params: this.resolverManager?.params,
      orgName: authenticatedData?.orgName,
      credentialProvider: this.getAwsDeploymentCredentials,
      resolverManager: this.resolverManager,
    })

    return { authenticatedData }
  }

  async getAwsCredentialProvider() {
    const { region, resolveCredentials } = await getAwsCredentialProvider({
      awsProfile: this.options?.['aws-profile'],
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
}

/**
 * @typedef {Object} RunComposeOptions
 * @property {string} configFile
 * @property {string} configFileDirPath
 * @property {string[]} command
 * @property {Record<string, any>} options
 * @property {Record<string, any>} versions
 * @property {Record<string, ResolverProvider>} resolverProviders
 * @property {Record<string, any>} params
 * @property {string} orgName
 */
const runCompose = async ({
  composeConfigFile,
  composeDirPath,
  versions,
  command,
  options,
  orgName,
  credentialProvider,
  resolverManager,
}) => {
  try {
    // Verify that a config file was provided
    if (!composeConfigFile) {
      const err = new ServerlessError(
        'A Compose configuration file was not provided',
        ServerlessErrorCodes.compose.COMPOSE_CONFIGURATION_NOT_PROVIDED,
      )
      err.stack = undefined
      throw err
    }

    if (
      ((!command || command?.length === 0) && (options.help || options.h)) ||
      command?.[0] === 'help'
    ) {
      renderComposeHelp()
      return
    }

    if (
      command.length > 1 &&
      composeConfigFile?.services &&
      Object.keys(composeConfigFile.services).includes(command[0])
    ) {
      options.service = command[0]
      command = command.slice(1)
    }
    // Verify that the command is supported if a service is not provided
    else if (
      !options.service &&
      !supportedComposeCommands.includes(command.join(' '))
    ) {
      // Check if user meant
      // to run a framework command on a service that does not exist
      if (frameworkCommandsSchema.get(command.slice(1).join(' '))) {
        const err = new ServerlessError(
          `The service ${command[0]} does not exist in the Compose configuration.`,
          ServerlessErrorCodes.compose.COMPOSE_COMMAND_NOT_SUPPORTED,
        )
        err.stack = undefined
        throw err
      }
      const err = new ServerlessError(
        `The command "${command.join(' ')}" is not currently supported by Compose.`,
        ServerlessErrorCodes.compose.COMPOSE_COMMAND_NOT_SUPPORTED,
      )
      err.stack = undefined
      throw err
    }

    const composeService = await parseComposeGraph({
      servicePath: composeDirPath,
      configuration: composeConfigFile,
      versions,
    })

    const { putServiceState, getServiceState } = await resolveStateStore({
      resolverProviders: resolverManager.getResolverProviders(),
      service: composeConfigFile,
      credentialProvider,
      resolverManager,
    })

    const state = {
      localState: {},
      putServiceState,
      getServiceState,
    }

    if (options?.service) {
      await composeService.executeSingleComponent({
        serviceName: options.service,
        reverse: false,
        composeOrgName: orgName,
        command,
        options,
        resolverProviders: resolverManager.getResolverProviders(),
        params: resolverManager.params,
        state,
      })
    } else {
      if (
        getGlobalRendererSettings().logLevel === 'notice' ||
        getGlobalRendererSettings().logLevel === 'info'
      ) {
        setGlobalRendererSettings({ logLevel: 'compose' })
      }

      const logger = log.get('core:compose')
      logger.logoCompose()

      if (
        command[0] === 'deploy' &&
        getGlobalRendererSettings().isInteractive
      ) {
        // Educate
        logger.writeCompose(
          style.aside(
            `Serverless Compose enables you to deploy multiple services in one command, in parallel, or ordered by dependencies.
Docs: https://www.serverless.com/framework/docs/guides/compose
`,
          ),
        )
      }

      await composeService.executeComponentsGraph({
        command,
        reverse: false,
        composeOrgName: orgName,
        options,
        resolverProviders: resolverManager.getResolverProviders(),
        params: resolverManager.params,
        state,
      })
      composeService.printRunReport({ command })
    }
  } catch (err) {
    if (getGlobalRendererSettings().logLevel === 'compose') {
      // Reset the log level to what it was
      setGlobalRendererSettings({
        logLevel: options.verbose ? 'info' : 'notice',
      })
    }
    throw err
  }
}

export { runCompose }
