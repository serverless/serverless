#!/usr/bin/env node

'use strict';

require('essentials');

// global graceful-fs patch
// https://github.com/isaacs/node-graceful-fs#global-patching
require('graceful-fs').gracefulify(require('fs'));

// Setup log writing
require('@serverless/utils/log-reporters/node');
const { log, progress, isInteractive: isInteractiveTerminal } = require('@serverless/utils/log');

const processLog = log.get('process');

const handleError = require('../lib/cli/handle-error');
const {
  storeLocally: storeTelemetryLocally,
  send: sendTelemetry,
} = require('../lib/utils/telemetry');
const generateTelemetryPayload = require('../lib/utils/telemetry/generate-payload');
const isTelemetryDisabled = require('../lib/utils/telemetry/are-disabled');
const logDeprecation = require('../lib/utils/log-deprecation');
const resolveConsoleAuthMode = require('@serverless/utils/auth/resolve-mode');

let command;
let isHelpRequest;
let options;
let commandSchema;
let serviceDir = null;
let configuration = null;
let serverless;
let isConsoleAuthenticated = false;
const commandUsage = {};
const variableSourcesInConfig = new Set();

// Inquirer async operations do not keep node process alive
// We need to issue a keep alive timer so process does not die
// to properly handle e.g. `SIGINT` interrupt
const keepAliveTimer = setTimeout(() => {}, 60 * 60 * 1000);

const trueWithProbability = (probability) => Math.random() < probability;

let processSpanPromise;
let hasBeenFinalized = false;
const finalize = async ({ error, shouldBeSync, telemetryData, shouldSendTelemetry } = {}) => {
  processLog.debug('finalize %o', { error, shouldBeSync, telemetryData, shouldSendTelemetry });
  if (hasBeenFinalized) {
    if (error) {
      // Programmer error in finalize handling, ensure to expose
      process.nextTick(() => {
        throw error;
      });
    }
    return null;
  }
  hasBeenFinalized = true;
  clearTimeout(keepAliveTimer);
  progress.clear();
  if (error) ({ telemetryData } = await handleError(error, { serverless }));
  if (!shouldBeSync) {
    await logDeprecation.printSummary();
    await resolveConsoleAuthMode().then(
      (mode) => {
        isConsoleAuthenticated = Boolean(mode);
      },
      () => {}
    );
  }
  if (isTelemetryDisabled || !commandSchema) return null;
  if (!error && isHelpRequest) return null;
  storeTelemetryLocally({
    ...generateTelemetryPayload({
      command,
      options,
      commandSchema,
      serviceDir,
      configuration,
      serverless,
      commandUsage,
      variableSources: variableSourcesInConfig,
      isConsoleAuthenticated,
    }),
    ...telemetryData,
  });

  // We want to explicitly ensure that when processing should be sync, we never attempt sending telemetry data
  if (shouldBeSync) return null;

  // We want to send telemetry at least roughly every 20 commands (in addition to sending on deploy and on errors)
  // to avoid situations where we have very big batches of telemetry events that cannot be processed on the backend side
  const shouldForceTelemetry = trueWithProbability(0.05);

  if (!error && !shouldSendTelemetry && !shouldForceTelemetry) return null;
  return sendTelemetry({ serverlessExecutionSpan: processSpanPromise });
};

process.once('uncaughtException', (error) => {
  log.error('Uncaught exception');
  finalize({ error }).then(() => process.exit());
});

processSpanPromise = (async () => {
  try {
    const wait = require('timers-ext/promise/sleep');
    await wait(); // Ensure access to "processSpanPromise"

    resolveConsoleAuthMode().then(
      (mode) => {
        isConsoleAuthenticated = Boolean(mode);
      },
      () => {}
    );
    require('signal-exit/signals').forEach((signal) => {
      process.once(signal, () => {
        processLog.debug('exit signal %s', signal);
        // If there's another listener (e.g. we're in daemon context or reading stdin input)
        // then let the other listener decide how process will exit
        const isOtherSigintListener = Boolean(process.listenerCount(signal));
        finalize({
          shouldBeSync: true,
          telemetryData: { outcome: 'interrupt', interruptSignal: signal },
        });
        if (isOtherSigintListener) return;
        // Follow recommendation from signal-exit:
        // https://github.com/tapjs/signal-exit/blob/654117d6c9035ff6a805db4d4acf1f0c820fcb21/index.js#L97-L98
        if (process.platform === 'win32' && signal === 'SIGHUP') signal = 'SIGINT';
        process.kill(process.pid, signal);
      });
    });

    const humanizePropertyPathKeys = require('../lib/configuration/variables/humanize-property-path-keys');
    const processBackendNotificationRequest = require('../lib/utils/process-backend-notification-request');

    (() => {
      // Rewrite eventual `sls deploy -f` into `sls deploy function -f`
      // Also rewrite `serverless dev` to `serverless --dev``
      const isParamName = RegExp.prototype.test.bind(require('../lib/cli/param-reg-exp'));

      const args = process.argv.slice(2);
      const firstParamIndex = args.findIndex(isParamName);
      const commands = args.slice(0, firstParamIndex === -1 ? Infinity : firstParamIndex);

      if (commands.join('') === 'dev') {
        process.argv[2] = '--dev';
        return;
      }

      if (commands.join(' ') !== 'deploy') return;
      if (!args.includes('-f') && !args.includes('--function')) return;
      logDeprecation(
        'CLI_DEPLOY_FUNCTION_OPTION_V3',
        'Starting with v4.0.0, `--function` or `-f` option for `deploy` command will no longer be supported. In order to deploy a single function, please use `deploy function` command instead.'
      );
      process.argv.splice(3, 0, 'function');
    })();

    const resolveInput = require('../lib/cli/resolve-input');

    let commands;
    processLog.debug('resolve CLI input (no service schema)');
    // Parse args against schemas of commands which do not require to be run in service context
    ({ command, commands, options, isHelpRequest, commandSchema } = resolveInput(
      require('../lib/cli/commands-schema/no-service')
    ));

    // If version number request, show it and abort
    if (options.version) {
      processLog.debug('render version');
      await require('../lib/cli/render-version')();
      await finalize();
      return;
    }

    const ServerlessError = require('../lib/serverless-error');

    // Abort if command is not supported in this environment
    if (commandSchema && commandSchema.isHidden && commandSchema.noSupportNotice) {
      throw new ServerlessError(
        `Cannot run \`${command}\` command: ${commandSchema.noSupportNotice}`,
        'NOT_SUPPORTED_COMMAND'
      );
    }

    const path = require('path');
    const uuid = require('uuid');
    const _ = require('lodash');
    const clear = require('ext/object/clear');
    const Serverless = require('../lib/serverless');
    const resolveVariables = require('../lib/configuration/variables/resolve');
    const isPropertyResolved = require('../lib/configuration/variables/is-property-resolved');
    const eventuallyReportVariableResolutionErrors = require('../lib/configuration/variables/eventually-report-resolution-errors');
    const filterSupportedOptions = require('../lib/cli/filter-supported-options');
    const isDashboardEnabled = require('../lib/configuration/is-dashboard-enabled');

    let configurationPath = null;
    let providerName;
    let variablesMeta;
    let resolverConfiguration;
    let isInteractiveSetup;

    const ensureResolvedProperty = (propertyPath) => {
      if (isPropertyResolved(variablesMeta, propertyPath)) return true;
      variablesMeta = null;
      if (isHelpRequest) return false;
      const humanizedPropertyPath = humanizePropertyPathKeys(propertyPath.split('\0'));
      throw new ServerlessError(
        `Cannot resolve ${path.basename(
          configurationPath
        )}: "${humanizedPropertyPath}" property is not accessible ` +
          '(configured behind variables which cannot be resolved at this stage)',
        'INACCESSIBLE_CONFIGURATION_PROPERTY'
      );
    };

    if (!commandSchema || commandSchema.serviceDependencyMode) {
      // Command is potentially service specific, follow up with resolution of service config

      // Parse args again, taking account schema of service-specific flags
      // as they may influence configuration resolution
      processLog.debug('resolve CLI input (service schema)');
      resolveInput.clear();
      ({ command, commands, options, isHelpRequest, commandSchema } = resolveInput(
        require('../lib/cli/commands-schema/service')
      ));

      isInteractiveSetup = !isHelpRequest && command === '';

      processLog.debug('resolve eventual service configuration');
      const resolveConfigurationPath = require('../lib/cli/resolve-configuration-path');
      const readConfiguration = require('../lib/configuration/read');
      const resolveProviderName = require('../lib/configuration/resolve-provider-name');

      // Resolve eventual service configuration path
      configurationPath = await resolveConfigurationPath();
      if (configurationPath) {
        processLog.debug('service configuration found at %s', configurationPath);
      } else processLog.debug('no service configuration found');

      // If service configuration file is found, load its content
      configuration = configurationPath
        ? await (async () => {
            try {
              return await readConfiguration(configurationPath);
            } catch (error) {
              // Configuration syntax error should not prevent help from being displayed
              // (if possible configuration should be read for help request as registered
              // plugins may introduce new commands to be listed in help output)
              if (isHelpRequest) return null;
              throw error;
            }
          })()
        : null;

      if (configuration) {
        processLog.debug('service configuration file successfully parsed');
        serviceDir = process.cwd();

        // IIFE for maintenance convenience
        await (async () => {
          // We do not need to attempt resolution of further variables for login command as
          // the only variables from configuration that we potentially rely on is `app` and `org`
          // TODO: Remove when dashboard/console login prompt won't be needed - when that happens
          // login command should once again be service independent
          if (command === 'login') return;

          processLog.debug('resolve variables meta');
          const resolveVariablesMeta = require('../lib/configuration/variables/resolve-meta');

          variablesMeta = resolveVariablesMeta(configuration);

          if (
            eventuallyReportVariableResolutionErrors(
              configurationPath,
              configuration,
              variablesMeta
            )
          ) {
            // Variable syntax errors, abort
            variablesMeta = null;
            return;
          }

          if (!ensureResolvedProperty('disabledDeprecations')) return;
          if (!ensureResolvedProperty('deprecationNotificationMode')) return;

          if (isPropertyResolved(variablesMeta, 'provider\0name')) {
            providerName = resolveProviderName(configuration);
            if (providerName == null) {
              variablesMeta = null;
              return;
            }
          }
          if (!commandSchema && providerName === 'aws') {
            // If command was not recognized in previous resolution phases
            // parse args again also against schemas commands which require AWS service context
            processLog.debug('resolve CLI input (AWS service schema)');
            resolveInput.clear();
            ({ command, commands, options, isHelpRequest, commandSchema } = resolveInput(
              require('../lib/cli/commands-schema/aws-service')
            ));
          }

          let envVarNamesNeededForDotenvResolution;
          if (variablesMeta.size) {
            processLog.debug('resolve variables in core properties');
            // Some properties are configured with variables

            // Resolve eventual variables in `provider.stage` and `useDotEnv`
            // (required for reliable .env resolution)
            resolverConfiguration = {
              serviceDir,
              configuration,
              variablesMeta,
              sources: {
                env: require('../lib/configuration/variables/sources/env'),
                file: require('../lib/configuration/variables/sources/file'),
                opt: require('../lib/configuration/variables/sources/opt'),
                self: require('../lib/configuration/variables/sources/self'),
                strToBool: require('../lib/configuration/variables/sources/str-to-bool'),
                sls: require('../lib/configuration/variables/sources/instance-dependent/get-sls')(),
              },
              options: filterSupportedOptions(options, { commandSchema, providerName }),
              fulfilledSources: new Set(['file', 'self', 'strToBool']),
              propertyPathsToResolve: new Set(['provider\0name', 'provider\0stage', 'useDotenv']),
              variableSourcesInConfig,
            };

            if (isInteractiveSetup) resolverConfiguration.fulfilledSources.add('opt');
            await resolveVariables(resolverConfiguration);

            if (
              eventuallyReportVariableResolutionErrors(
                configurationPath,
                configuration,
                variablesMeta
              )
            ) {
              // Unrecoverable resolution errors, abort
              variablesMeta = null;
              return;
            }

            if (!providerName && isPropertyResolved(variablesMeta, 'provider\0name')) {
              providerName = resolveProviderName(configuration);
              if (providerName == null) {
                variablesMeta = null;
                return;
              }
              if (!commandSchema && providerName === 'aws') {
                // If command was not recognized in previous resolution phases
                // Parse args again also against schemas of commands which work in context of an AWS
                // service
                processLog.debug('resolve CLI input (AWS service schema)');
                resolveInput.clear();
                ({ command, commands, options, isHelpRequest, commandSchema } = resolveInput(
                  require('../lib/cli/commands-schema/aws-service')
                ));

                if (commandSchema) {
                  processLog.debug('resolve variables in core properties #2');
                  resolverConfiguration.options = filterSupportedOptions(options, {
                    commandSchema,
                    providerName,
                  });
                  await resolveVariables(resolverConfiguration);
                  if (
                    eventuallyReportVariableResolutionErrors(
                      configurationPath,
                      configuration,
                      variablesMeta
                    )
                  ) {
                    variablesMeta = null;
                    return;
                  }
                }
              }
            }

            resolverConfiguration.fulfilledSources.add('env');
            if (
              !isPropertyResolved(variablesMeta, 'provider\0stage') ||
              !isPropertyResolved(variablesMeta, 'useDotenv')
            ) {
              // Assume "env" source fulfilled for `provider.stage` and `useDotenv` resolution.
              // To pick eventual resolution conflict, track what env variables were reported
              // missing when applying this resolution
              processLog.debug('resolve variables in stage related properties');
              const envSource = require('../lib/configuration/variables/sources/env');
              envSource.missingEnvVariables.clear();
              await resolveVariables({
                ...resolverConfiguration,
                propertyPathsToResolve: new Set(['provider\0stage', 'useDotenv']),
              });
              if (
                eventuallyReportVariableResolutionErrors(
                  configurationPath,
                  configuration,
                  variablesMeta
                )
              ) {
                // Unrecoverable resolution errors, abort
                variablesMeta = null;
                return;
              }

              if (
                !ensureResolvedProperty('provider\0stage', {
                  shouldSilentlyReturnIfLegacyMode: true,
                })
              ) {
                return;
              }

              if (!ensureResolvedProperty('useDotenv')) return;

              envVarNamesNeededForDotenvResolution = envSource.missingEnvVariables;
            }
          }

          // Load eventual environment variables from .env files
          if (await require('../lib/cli/conditionally-load-dotenv')(options, configuration)) {
            if (envVarNamesNeededForDotenvResolution) {
              for (const envVarName of envVarNamesNeededForDotenvResolution) {
                if (process.env[envVarName]) {
                  throw new ServerlessError(
                    'Cannot reliably resolve "env" variables due to resolution conflict.\n' +
                      `Environment variable "${envVarName}" which influences resolution of ` +
                      '".env" file were found to be defined in resolved ".env" file.' +
                      'DOTENV_ENV_VAR_RESOLUTION_CONFLICT'
                  );
                }
              }
            }
            if (!isPropertyResolved(variablesMeta, 'provider\0name')) {
              processLog.debug('resolve variables in "provider.name"');
              await resolveVariables(resolverConfiguration);
              if (
                eventuallyReportVariableResolutionErrors(
                  configurationPath,
                  configuration,
                  variablesMeta
                )
              ) {
                variablesMeta = null;
                return;
              }
            }
          }

          if (!variablesMeta.size) return; // No properties configured with variables

          if (!providerName) {
            if (!ensureResolvedProperty('provider\0name')) return;
            providerName = resolveProviderName(configuration);
            if (providerName == null) {
              variablesMeta = null;
              return;
            }
            if (!commandSchema && providerName === 'aws') {
              processLog.debug('resolve CLI input (AWS service schema)');
              resolveInput.clear();
              ({ command, commands, options, isHelpRequest, commandSchema } = resolveInput(
                require('../lib/cli/commands-schema/aws-service')
              ));
              if (commandSchema) {
                resolverConfiguration.options = filterSupportedOptions(options, {
                  commandSchema,
                  providerName,
                });
              }
            }
          }
          if (isHelpRequest || commands[0] === 'plugin') {
            processLog.debug('resolve variables in "plugins"');
            // We do not need full config resolved, we just need to know what
            // provider is service setup with, and with what eventual plugins Framework is extended
            // as that influences what CLI commands and options could be used,
            resolverConfiguration.propertyPathsToResolve.add('plugins');
          } else {
            processLog.debug('resolve variables in all properties');
            delete resolverConfiguration.propertyPathsToResolve;
          }

          await resolveVariables(resolverConfiguration);
          if (
            eventuallyReportVariableResolutionErrors(
              configurationPath,
              configuration,
              variablesMeta
            )
          ) {
            variablesMeta = null;
            return;
          }

          if (!variablesMeta.size) return; // All properties successfully resolved

          if (!ensureResolvedProperty('plugins')) return;

          // At this point we have all properties needed for `plugin install/uninstall` commands
          if (commands[0] === 'plugin') {
            return;
          }

          if (!ensureResolvedProperty('package\0path')) return;

          if (!ensureResolvedProperty('frameworkVersion')) return;
          if (!ensureResolvedProperty('app')) return;
          if (!ensureResolvedProperty('org')) return;
          if (!ensureResolvedProperty('dashboard')) return;
          if (!ensureResolvedProperty('service')) return;
          if (isDashboardEnabled({ configuration, options })) {
            // Dashboard requires AWS region to be resolved upfront
            ensureResolvedProperty('provider\0region');
          }
        })();

        // Ensure to have full AWS commands schema loaded if we're in context of AWS provider
        // It's not the case if not AWS service specific command was resolved
        if (configuration && resolveProviderName(configuration) === 'aws') {
          processLog.debug('resolve CLI input (AWS service schema)');
          resolveInput.clear();
          ({ command, commands, options, isHelpRequest, commandSchema } = resolveInput(
            require('../lib/cli/commands-schema/aws-service')
          ));
        }
      } else {
        // In non-service context we recognize all AWS service commands
        processLog.debug('parsing of configuration file failed');
        processLog.debug('resolve CLI input (AWS service schema)');
        resolveInput.clear();
        ({ command, commands, options, isHelpRequest, commandSchema } = resolveInput(
          require('../lib/cli/commands-schema/aws-service')
        ));

        // Validate result command and options
        require('../lib/cli/ensure-supported-command')();
      }
    } else {
      require('../lib/cli/ensure-supported-command')();
    }

    const configurationFilename = configuration && configurationPath.slice(serviceDir.length + 1);

    // Names of the commands which are configured independently in root `commands` folder
    // and not in Serverless class internals
    const notIntegratedCommands = new Set([
      'doctor',
      'login',
      'logout',
      'plugin install',
      'plugin uninstall',
    ]);
    const isStandaloneCommand = notIntegratedCommands.has(command);

    if (!isHelpRequest) {
      if (isStandaloneCommand) {
        processLog.debug('run standalone command');
        if (configuration) require('../lib/cli/ensure-supported-command')(configuration);
        await require(`../commands/${commands.join('-')}`)({
          configuration,
          serviceDir,
          configurationFilename,
          options,
        });
        await finalize({ telemetryData: { outcome: 'success' } });
        return;
      } else if (isInteractiveSetup) {
        if (!isInteractiveTerminal) {
          throw new ServerlessError(
            'Attempted to run an interactive setup in non TTY environment.\n' +
              "If that's intended, run with the SLS_INTERACTIVE_SETUP_ENABLE=1 environment variable",
            'INTERACTIVE_SETUP_IN_NON_TTY'
          );
        }
        if (!configuration) {
          processLog.debug('run interactive onboarding');
          const interactiveContext = await require('../lib/cli/interactive-setup')({
            configuration,
            serviceDir,
            configurationFilename,
            options,
            commandUsage,
          });
          if (interactiveContext.configuration) {
            configuration = interactiveContext.configuration;
          }
          if (interactiveContext.serverless) {
            serverless = interactiveContext.serverless;
          }
          await finalize({ telemetryData: { outcome: 'success' }, shouldSendTelemetry: true });
          return;
        }
      }
    }

    processLog.debug('construct Serverless instance');
    serverless = new Serverless({
      configuration,
      serviceDir,
      configurationFilename,
      commands,
      options,
      variablesMeta,
    });

    try {
      serverless.onExitPromise = processSpanPromise;
      serverless.invocationId = uuid.v4();
      processLog.debug('initialize Serverless instance');
      await serverless.init();

      // IIFE for maintenance convenience
      await (async () => {
        if (!configuration) return;

        let hasFinalCommandSchema = false;
        if (configuration.plugins) {
          // After plugins are loaded, re-resolve CLI command and options schema as plugin
          // might have defined extra commands and options

          if (serverless.pluginManager.externalPlugins.size) {
            processLog.debug('resolve CLI input (+ plugins schema)');
            const commandsSchema = require('../lib/cli/commands-schema/resolve-final')(
              serverless.pluginManager.externalPlugins,
              { providerName: providerName || 'aws', configuration }
            );
            resolveInput.clear();
            ({ command, commands, options, isHelpRequest, commandSchema } =
              resolveInput(commandsSchema));
            serverless.processedInput.commands = serverless.pluginManager.cliCommands = commands;
            serverless.processedInput.options = options;
            Object.assign(clear(serverless.pluginManager.cliOptions), options);
            hasFinalCommandSchema = true;
          }
        }
        if (!providerName && !hasFinalCommandSchema) {
          // Invalid configuration, ensure to recognize all AWS commands
          processLog.debug('resolve CLI input (AWS service schema)');
          resolveInput.clear();
          ({ command, commands, options, isHelpRequest, commandSchema } = resolveInput(
            require('../lib/cli/commands-schema/aws-service')
          ));
        }
        hasFinalCommandSchema = true;

        // Validate result command and options
        if (hasFinalCommandSchema) require('../lib/cli/ensure-supported-command')(configuration);
        if (isHelpRequest) return;
        if (!_.get(variablesMeta, 'size')) return;
        if (!resolverConfiguration) {
          // There were no variables in the initial configuration, yet it was extended by
          // the plugins with ones.
          // In this case we need to ensure `resolverConfiguration` which initially was not setup
          resolverConfiguration = {
            serviceDir,
            configuration,
            variablesMeta,
            sources: {
              env: require('../lib/configuration/variables/sources/env'),
              file: require('../lib/configuration/variables/sources/file'),
              opt: require('../lib/configuration/variables/sources/opt'),
              self: require('../lib/configuration/variables/sources/self'),
              strToBool: require('../lib/configuration/variables/sources/str-to-bool'),
              sls: require('../lib/configuration/variables/sources/instance-dependent/get-sls')(),
            },
            options: filterSupportedOptions(options, { commandSchema, providerName }),
            fulfilledSources: new Set(['env', 'file', 'self', 'strToBool']),
            propertyPathsToResolve:
              commands[0] === 'plugin'
                ? new Set(['plugins', 'provider\0name', 'provider\0stage', 'useDotenv'])
                : null,
            variableSourcesInConfig,
          };
        }

        if (commandSchema) {
          resolverConfiguration.options = filterSupportedOptions(options, {
            commandSchema,
            providerName,
          });
        }
        resolverConfiguration.fulfilledSources.add('opt');

        // Register serverless instance specific variable sources
        resolverConfiguration.sources.sls =
          require('../lib/configuration/variables/sources/instance-dependent/get-sls')(serverless);
        resolverConfiguration.fulfilledSources.add('sls');

        resolverConfiguration.sources.param =
          serverless.pluginManager.dashboardPlugin.configurationVariablesSources.param;
        resolverConfiguration.fulfilledSources.add('param');

        // Register dashboard specific variable source resolvers
        if (isDashboardEnabled({ configuration, options })) {
          for (const [sourceName, sourceConfig] of Object.entries(
            serverless.pluginManager.dashboardPlugin.configurationVariablesSources
          )) {
            if (sourceName === 'param') continue;
            resolverConfiguration.sources[sourceName] = sourceConfig;
            resolverConfiguration.fulfilledSources.add(sourceName);
          }
        }

        // Register AWS provider specific variable sources
        if (providerName === 'aws') {
          // Pre-resolve to eventually pick not yet resolved AWS auth related properties
          processLog.debug('resolve variables');
          await resolveVariables(resolverConfiguration);
          if (!variablesMeta.size) return;
          if (
            eventuallyReportVariableResolutionErrors(
              configurationPath,
              configuration,
              variablesMeta
            )
          ) {
            return;
          }

          // Ensure properties which are crucial to some variable source resolvers
          // are actually resolved.
          if (
            !ensureResolvedProperty('provider\0credentials') ||
            !ensureResolvedProperty('provider\0deploymentBucket\0serverSideEncryption') ||
            !ensureResolvedProperty('provider\0profile') ||
            !ensureResolvedProperty('provider\0region')
          ) {
            return;
          }
          Object.assign(resolverConfiguration.sources, {
            cf: require('../lib/configuration/variables/sources/instance-dependent/get-cf')(
              serverless
            ),
            s3: require('../lib/configuration/variables/sources/instance-dependent/get-s3')(
              serverless
            ),
            ssm: require('../lib/configuration/variables/sources/instance-dependent/get-ssm')(
              serverless
            ),
            aws: require('../lib/configuration/variables/sources/instance-dependent/get-aws')(
              serverless
            ),
          });
          resolverConfiguration.fulfilledSources.add('cf').add('s3').add('ssm').add('aws');
        }

        // Register variable source resolvers provided by external plugins
        const resolverExternalPluginSources = require('../lib/configuration/variables/sources/resolve-external-plugin-sources');
        resolverExternalPluginSources(
          configuration,
          resolverConfiguration,
          serverless.pluginManager.externalPlugins
        );

        // Having all source resolvers configured, resolve variables
        processLog.debug('resolve all variables');
        await resolveVariables(resolverConfiguration);
        if (!variablesMeta.size) return;
        if (
          eventuallyReportVariableResolutionErrors(configurationPath, configuration, variablesMeta)
        ) {
          return;
        }

        // Do not confirm on unresolved sources with partially resolved configuration
        if (resolverConfiguration.propertyPathsToResolve) return;

        processLog.debug('uresolved variables meta: %o', variablesMeta);
        // Report unrecognized variable sources found in variables configured in service config
        const unresolvedSources =
          require('../lib/configuration/variables/resolve-unresolved-source-types')(variablesMeta);
        const recognizedSourceNames = new Set(Object.keys(resolverConfiguration.sources));

        const unrecognizedSourceNames = Array.from(unresolvedSources.keys()).filter(
          (sourceName) => !recognizedSourceNames.has(sourceName)
        );

        if (unrecognizedSourceNames.includes('output')) {
          throw new ServerlessError(
            '"Cannot resolve configuration: ' +
              '"output" variable can only be used in ' +
              'services deployed with Serverless Dashboard (with "org" setting configured)',
            'DASHBOARD_VARIABLE_SOURCES_MISUSE'
          );
        }
        throw new ServerlessError(
          `Unrecognized configuration variable sources: "${unrecognizedSourceNames.join('", "')}"`,
          'UNRECOGNIZED_VARIABLE_SOURCES'
        );
      })();

      if (isHelpRequest && serverless.pluginManager.externalPlugins) {
        // Show help
        processLog.debug('render help');
        require('../lib/cli/render-help')(serverless.pluginManager.externalPlugins);
      } else if (isInteractiveSetup) {
        processLog.debug('run interactive onboarding');
        const interactiveContext = await require('../lib/cli/interactive-setup')({
          configuration,
          serverless,
          serviceDir,
          configurationFilename,
          options,
          commandUsage,
        });
        if (interactiveContext.configuration) {
          configuration = interactiveContext.configuration;
        }
        if (interactiveContext.serverless) {
          serverless = interactiveContext.serverless;
        }
      } else {
        processLog.debug('run Serverless instance');
        // Run command
        await serverless.run();
      }

      const backendNotificationRequest = await finalize({
        telemetryData: { outcome: 'success' },
        shouldSendTelemetry: isInteractiveSetup || commands.join(' ') === 'deploy',
      });
      if (!isInteractiveSetup && backendNotificationRequest) {
        await processBackendNotificationRequest(backendNotificationRequest);
      }
    } catch (error) {
      processLog.debug('handle error');
      // If Dashboard Plugin, capture error
      const dashboardPlugin = serverless.pluginManager.dashboardPlugin;
      const dashboardErrorHandler = _.get(dashboardPlugin, 'enterprise.errorHandler');
      if (!dashboardErrorHandler) throw error;
      try {
        await dashboardErrorHandler(error, serverless.invocationId);
      } catch (dashboardErrorHandlerError) {
        const tokenizeException = require('../lib/utils/tokenize-exception');
        const exceptionTokens = tokenizeException(dashboardErrorHandlerError);
        log.warning(
          `Publication to Serverless Dashboard errored with:\n${' '.repeat('Serverless: '.length)}${
            exceptionTokens.isUserError || !exceptionTokens.stack
              ? exceptionTokens.message
              : exceptionTokens.stack
          }`
        );
      }
      throw error;
    }
  } catch (error) {
    await finalize({ error });
  }
})();
