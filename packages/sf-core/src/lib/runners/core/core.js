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
import agentSkillsInstall from './agent-skills-install.js'
import { TraditionalRunner } from '../framework.js'
import { Authentication } from '../../auth/index.js'
import commandOnboarding from './onboarding.js'
import commandSupport from './support.js'
import commandUsage from './usage.js'
import commandReconcile from './reconcile.js'
import commandMcp from './mcp.js'
import { getAwsCredentialProvider } from '../../../utils/index.js'
import loginAws from './login-aws.js'
import loginAwsSso from './login-aws-sso.js'

/**
 * Converts a dashed CLI option key to its yargs camel-case-expansion form,
 * e.g. `aws-services` -> `awsServices`. No dash -> returned unchanged.
 */
function toCamelCase(key) {
  return key.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())
}

/**
 * Drops yargs's camelCase DUPLICATE option keys before delegating to the
 * framework runner.
 *
 * Why this is needed (and why it belongs HERE, not in the shared parser):
 * `agent inspect` is declared in CoreRunner's CLI schema so the router can
 * parse/help it, but the command itself is a framework plugin, so it's handed
 * off via delegateToFramework(). The schema round-trip that gets us here
 * (router -> validateCliSchema -> a yargs parse in utils/cli/cli.js) uses
 * yargs's DEFAULT `camel-case-expansion`, which mints a camelCase alias for
 * every dashed option: `--aws-services x` yields BOTH `aws-services` AND
 * `awsServices`. The framework's `ensure-supported-command` validates EVERY
 * forwarded option key against the command schema (which keys the canonical
 * DASHED form, `aws-services`), so the extra `awsServices` key trips
 * "Unrecognized option". Native framework commands (deploy/info) never hit
 * this because they don't go through CoreRunner's yargs round-trip.
 *
 * The conforming, least-invasive fix: forward only the canonical keys the
 * framework expects by removing a camelCase key WHEN its dashed source key is
 * also present (i.e. it is unambiguously a yargs expansion artifact, not a
 * user-supplied distinct option). This touches only the delegation boundary --
 * NOT the shared arg parser, yargs config, or ensure-supported-command.
 */
function stripCamelCaseDuplicateOptions(options) {
  if (!options || typeof options !== 'object') return options
  const dashedKeys = Object.keys(options).filter((key) => key.includes('-'))
  if (dashedKeys.length === 0) return options
  const camelDuplicates = new Set(
    dashedKeys
      .map((key) => toCamelCase(key))
      .filter((camel) => Object.prototype.hasOwnProperty.call(options, camel)),
  )
  if (camelDuplicates.size === 0) return options
  const forwarded = {}
  for (const [key, value] of Object.entries(options)) {
    if (camelDuplicates.has(key)) continue
    forwarded[key] = value
  }
  return forwarded
}

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
        command: 'agent',
        description: 'Manage AI agent integrations for this service',
        builder: [
          {
            command: 'skills',
            description: 'Manage Serverless Framework Agent Skills',
            builder: [
              {
                command: 'install',
                description:
                  'Install Agent Skills into this service directory (.claude/skills, .agents/skills). Idempotent: re-run to update.',
                builder: [
                  {
                    options: {
                      dir: {
                        description:
                          'Only write the given directories: "claude" (.claude/skills — Claude Code) or "agents" (.agents/skills — open Agent Skills standard: Codex, Cursor, ...)',
                        type: 'string',
                        array: true,
                      },
                    },
                  },
                ],
              },
            ],
          },
          {
            // Declared here so the router can parse/help `agent inspect` (and
            // so `--name` becomes an array via yargs `array: true`), but the
            // command itself is a framework plugin — `case 'agent':` delegates
            // it to the framework runner. See packages/serverless/lib/plugins/agent/inspect.js.
            command: 'inspect',
            description:
              'Inspect a deployed service: a cheap resource index, or the raw AWS state of selected resources',
            builder: [
              {
                options: {
                  functions: {
                    description: 'Expand functions resources',
                    type: 'boolean',
                  },
                  api: {
                    description: 'Expand api resources',
                    type: 'boolean',
                  },
                  events: {
                    description: 'Expand events resources',
                    type: 'boolean',
                  },
                  iam: {
                    description: 'Expand iam resources',
                    type: 'boolean',
                  },
                  storage: {
                    description: 'Expand storage resources',
                    type: 'boolean',
                  },
                  observability: {
                    description: 'Expand observability resources',
                    type: 'boolean',
                  },
                  cdn: {
                    description: 'Expand cdn resources',
                    type: 'boolean',
                  },
                  identity: {
                    description: 'Expand identity resources',
                    type: 'boolean',
                  },
                  iot: {
                    description: 'Expand iot resources',
                    type: 'boolean',
                  },
                  sandboxes: {
                    description: 'Expand sandboxes resources',
                    type: 'boolean',
                  },
                  all: {
                    description: 'Expand every category',
                    type: 'boolean',
                  },
                  'aws-services': {
                    description:
                      'Comma-separated AWS service tokens to expand (e.g. "lambda,iam,s3")',
                    type: 'string',
                  },
                  name: {
                    description:
                      'Logical ID to scope to (repeatable; used alone auto-selects that resource)',
                    type: 'string',
                    array: true,
                  },
                  format: {
                    description: 'Output format: "json" (default) or "yaml"',
                    type: 'string',
                    default: 'json',
                  },
                },
              },
            ],
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

  /**
   * Hand a command off to the framework runner. Framework commands like
   * deploy/info never reach CoreRunner — the router's runner selection picks
   * TraditionalRunner for them directly, before any runner's `run()` executes.
   * `agent` subcommands (e.g. `inspect`) can't take that path because they are
   * declared in CoreRunner's CLI schema (so parsing/help know them and
   * `--name` parses as an array), which makes the router select CoreRunner.
   * This helper bridges the gap: it constructs the same TraditionalRunner the
   * router would have selected, forwards the full runner context, and returns
   * its result unchanged. (CoreRunner's own `default:` case just throws — it
   * has no delegation of its own.)
   *
   * @returns {Promise<Object>} The framework runner's result.
   */
  async delegateToFramework() {
    // CoreRunner never sets `this.stage` (the router resolves it via
    // `resolverManager.resolveStage()` before constructing the runner — see
    // getRunner() in ../../router.js — and CoreRunner's constructor doesn't
    // forward `stage` to `super()`). Call the same resolver here so the
    // delegated TraditionalRunner targets the same stage the router would
    // have resolved (e.g. a non-default `provider.stage` with no `--stage`
    // flag). `resolveStage()` is idempotent — it returns the already-cached
    // value when called again on the same manager instance.
    const stage = await this.resolverManager?.resolveStage()
    const frameworkRunner = new TraditionalRunner({
      versionFramework: this.versionFramework,
      command: this.command,
      options: stripCamelCaseDuplicateOptions(this.options),
      config: this.config,
      configFilePath: this.configFilePath,
      stage,
      resolverManager: this.resolverManager,
      // Note: `this.compose` is always undefined here for the same reason
      // `this.stage` was — CoreRunner's constructor above doesn't accept or
      // forward `compose` to `super()`, even though the router passes it in
      // and the base Runner class supports it. Unlike `stage`, there's no
      // resolver/manager to re-derive `compose` from, so it isn't "trivially
      // available" here; fixing it would mean changing CoreRunner's
      // constructor signature, which is out of scope for this fix. Left as
      // `this.compose` (i.e. undefined) to match current behavior.
      compose: this.compose,
    })
    return frameworkRunner.run()
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
      case 'agent': {
        // `agent skills install` is handled here by the CoreRunner. Every other
        // `agent` subcommand (e.g. `inspect`) is a framework plugin command and
        // is delegated to a TraditionalRunner via delegateToFramework() — see
        // its docstring for why these commands reach CoreRunner at all when
        // deploy/info never do. An unknown subcommand still gets the helpful
        // skills hint. The subcommand check happens before the service-config
        // guard (unlike 'plugin') so the hint shows even outside a service dir.
        if (this.command[1] === 'skills') {
          if (this.command[2] !== 'install') {
            throw new Error(
              'Unknown command. Did you mean "serverless agent skills install"?',
            )
          }
          if (!this.config || !this.configFilePath) {
            throw new ServerlessError(
              'This command must run in a service directory (serverless.yml not found)',
              ServerlessErrorCodes.general.CONFIG_FILE_NOT_FOUND,
            )
          }
          await agentSkillsInstall({
            configFilePath: this.configFilePath,
            options: this.options,
          })
          break
        }
        if (this.command[1] === 'inspect') {
          return this.delegateToFramework()
        }
        throw new Error(
          'Unknown command. Did you mean "serverless agent skills install"?',
        )
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
