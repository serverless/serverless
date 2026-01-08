import { Runner } from '../index.js'
import {
  log,
  progress,
  ServerlessError,
  ServerlessErrorCodes,
  setGlobalRendererSettings,
} from '@serverless/util'
import pluginInstall from './plugin-install.js'
import path from 'path'
import pluginUninstall from './plugin-uninstall.js'
import { Authentication } from '../../auth/index.js'
import commandOnboarding from './onboarding.js'
import commandSupport from './support.js'
import commandUsage from './usage.js'
import commandReconcile from './reconcile.js'
import commandMcp from './mcp.js'
import { getAwsCredentialProvider } from '../../../utils/index.js'
import loginAws from './login-aws.js'
import loginAwsSso from './login-aws-sso.js'

class CoreRunner extends Runner {
  constructor({
    config,
    configFilePath,
    command,
    options,
    versionFramework,
    resolverManager,
  }) {
    super({
      config,
      configFilePath,
      command,
      options,
      versionFramework,
      resolverManager,
    })
  }

  static getCliSchema() {
    return [
      {
        command: '$0',
        description: 'Onboard to Serverless Framework',
        builder: [
          {
            options: {
              app: {
                description: 'Dashboard app',
              },
              org: {
                description: 'Dashboard org',
              },
            },
          },
        ],
      },
      {
        command: 'login',
        description: 'Log in a user',
        builder: [
          {
            command: 'aws',
            description: 'Log in to AWS',
            builder: [
              {
                command: 'sso',
                description: 'Log in to AWS using SSO',
                builder: [
                  {
                    options: {
                      'sso-session': {
                        description: 'SSO session name to use',
                        type: 'string',
                      },
                      'aws-profile': {
                        description: 'AWS profile to read SSO config from',
                        type: 'string',
                      },
                    },
                  },
                ],
              },
              {
                options: {
                  'aws-profile': {
                    description: 'Profile to configure',
                    type: 'string',
                  },
                  region: {
                    description: 'Region to configure',
                    type: 'string',
                    alias: 'r',
                  },
                },
              },
            ],
          },
        ],
        options: {},
      },
      {
        command: 'logout',
        description: 'Log out the current user',
        options: {},
      },
      {
        command: 'support',
        description:
          'Generate a report for AI debugging, github issue, or open a support ticket',
        builder: [
          {
            options: {
              summary: {
                description:
                  'Create a summary report for sharing with your team, etc.',
                type: 'boolean',
              },
              ai: {
                description:
                  'Create a summary report optimized for AI debugging.',
                type: 'boolean',
              },
              github: {
                description:
                  'Produce a summary report optimized for pasting into a Github Issue',
                type: 'boolean',
              },
              all: {
                description:
                  'Produce a comprehensive report with all available data.',
                type: 'boolean',
              },
              support: {
                description: 'Get help from the Serverless support team.',
                type: 'boolean',
              },
            },
          },
        ],
      },
      {
        command: 'usage',
        description: `Displays the org's instance credit usage for the current month and export a list of billable instances to an instances.csv file`,
        builder: [
          {
            options: {
              help: {
                description: 'Show help for the usage command',
                type: 'boolean',
              },
              org: {
                description: 'Select an org to show usage for',
                type: 'string',
              },
            },
          },
        ],
      },
      {
        command: 'reconcile',
        description: `Reconciles your org's list of billable instances with the actual CloudFormation stacks currently in your AWS account. Run this command periodically to recover credits for stacks that were removed manually without running the remove command.`,
        builder: [
          {
            options: {
              help: {
                description: 'Show help for the reconcile command',
                type: 'boolean',
              },
              org: {
                description: 'Select an org to reconcile instances for',
                type: 'string',
              },
            },
          },
        ],
      },
      {
        command: 'plugin',
        description: 'Manage Serverless Plugins',
        builder: [
          {
            options: {
              name: {
                alias: 'n',
                description: 'The name of the plugin.',
                type: 'string',
                demandOption: true,
              },
            },
          },
          {
            command: 'install',
            description:
              'Installs a Serverless Plugin into or from the service',
          },
          {
            command: 'uninstall',
            description: 'Uninstalls a Serverless Plugin from the service',
          },
        ],
      },
      {
        command: 'mcp',
        description: 'Run Serverless MCP Server',
        builder: [
          {
            options: {
              transport: {
                description: 'Transport type (sse or stdio)',
                type: 'string',
                default: 'stdio',
              },
              port: {
                description:
                  'Port to run the server on (only for sse transport)',
                type: 'number',
                default: 3001,
              },
            },
          },
        ],
      },
    ]
  }

  getCliSchema() {
    return CoreRunner.getCliSchema()
  }

  async run() {
    const logger = log.get('core-runner')
    const p = progress.get('core-runner')
    // Run the command
    switch (this.command[0]) {
      case undefined: {
        const frameworkVersion = this.versionFramework
        await commandOnboarding({
          options: this.options,
          frameworkVersion,
        })
        break
      }
      case 'login': {
        if (this.command[1] === 'aws') {
          if (this.command[2] === 'sso') {
            await loginAwsSso(this.options)
          } else {
            await loginAws(this.options)
          }
        } else {
          if (logger.isInteractive()) {
            logger.logo()
            logger.aside('Welcome to Serverless Framework V.4')
          }
          await this.authenticate()
        }
        break
      }
      case 'logout': {
        await new Authentication({
          versionFramework: this.versionFramework,
        }).unAuthenticate()
        logger.success('You successfully logged out.')
        break
      }
      case 'support': {
        /**
         * User must be authenticated before proceeding with the support command
         */
        p.notice('Authenticating with Serverless and checking license')
        const auth = await this.resolveVariablesAndAuthenticate()
        p.remove()
        await commandSupport({
          auth,
          options: this.options,
          versionFramework: this.versionFramework,
        })
        break
      }
      case 'usage': {
        /**
         * User must be authenticated before proceeding with the usage command
         */
        p.notice('Authenticating with Serverless')
        const auth = await this.resolveVariablesAndAuthenticate()

        const { resolveCredentials } = await getAwsCredentialProvider({
          awsProfile: this.options['aws-profile'],
          providerAwsAccessKeyId:
            this.authenticatedData?.dashboard?.serviceProvider?.accessKeyId,
          providerAwsSecretAccessKey:
            this.authenticatedData?.dashboard?.serviceProvider?.secretAccessKey,
          providerAwsSessionToken:
            this.authenticatedData?.dashboard?.serviceProvider?.sessionToken,
          resolversManager: this.resolverManager,
        })

        const credentials = await resolveCredentials()

        p.remove()

        await commandUsage({
          auth,
          credentials,
          options: this.options,
          versionFramework: this.versionFramework,
        })
        break
      }
      case 'reconcile': {
        /**
         * User must be authenticated before proceeding with the reconcile command
         */
        p.notice('Authenticating with Serverless')
        const auth = await this.resolveVariablesAndAuthenticate()

        const { resolveCredentials } = await getAwsCredentialProvider({
          awsProfile: this.options['aws-profile'],
          providerAwsAccessKeyId:
            this.authenticatedData?.dashboard?.serviceProvider?.accessKeyId,
          providerAwsSecretAccessKey:
            this.authenticatedData?.dashboard?.serviceProvider?.secretAccessKey,
          providerAwsSessionToken:
            this.authenticatedData?.dashboard?.serviceProvider?.sessionToken,
          resolversManager: this.resolverManager,
        })

        const credentials = await resolveCredentials()

        p.remove()

        await commandReconcile({
          auth,
          credentials,
          options: this.options,
          versionFramework: this.versionFramework,
        })
        break
      }
      case 'plugin': {
        if (!this.config || !this.configFilePath) {
          throw new ServerlessError(
            'Configuration file not found',
            ServerlessErrorCodes.general.CONFIG_FILE_NOT_FOUND,
          )
        }
        const pluginCommand = this.command[1]
        switch (pluginCommand) {
          case 'install':
            await pluginInstall({
              configuration: this.config,
              configurationFilename: path.basename(this.configFilePath),
              configFileDirPath: path.dirname(this.configFilePath),
              pluginNameVersion: this.options.name,
              help: this.options.help,
            })
            break
          case 'uninstall':
            await pluginUninstall({
              configuration: this.config,
              configurationFilename: path.basename(this.configFilePath),
              configFileDirPath: path.dirname(this.configFilePath),
              pluginNameVersion: this.options.name,
              help: this.options.help,
            })
            break
          default:
            throw new Error('Plugin command not found')
        }
        break
      }
      case 'mcp': {
        try {
          setGlobalRendererSettings({ isInteractive: false })
          await this.authenticate()
        } catch (error) {
          logger.debug('Error authenticating:', error.message)
        }
        await commandMcp({
          options: this.options,
          authenticatedData: this.authenticatedData,
          versionFramework: this.versionFramework,
        })
        break
      }
      default:
        throw new Error('Command not found')
    }
    return {}
  }
}

export { CoreRunner }
