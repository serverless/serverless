#!/usr/bin/env node

'use strict';

require('essentials');

// global graceful-fs patch
// https://github.com/isaacs/node-graceful-fs#global-patching
require('graceful-fs').gracefulify(require('fs'));

if (require('../lib/utils/tabCompletion/isSupported') && process.argv[2] === 'completion') {
  require('../lib/utils/autocomplete')();
  return;
}

const handleError = require('../lib/cli/handle-error');
const humanizePropertyPathKeys = require('../lib/configuration/variables/humanize-property-path-keys');

const {
  storeLocally: storeTelemetryLocally,
  send: sendTelemetry,
} = require('../lib/utils/telemetry');
const generateTelemetryPayload = require('../lib/utils/telemetry/generatePayload');
const processBackendNotificationRequest = require('../lib/utils/processBackendNotificationRequest');
const isTelemetryDisabled = require('../lib/utils/telemetry/areDisabled');

let command;
let options;
let commandSchema;
let serviceDir = null;
let configuration = null;
let serverless;

let hasTelemetryBeenReported = false;

process.once('uncaughtException', (error) =>
  handleError(error, {
    isUncaughtException: true,
    command,
    options,
    commandSchema,
    serviceDir,
    configuration,
    serverless,
    hasTelemetryBeenReported,
  })
);

const processSpanPromise = (async () => {
  try {
    const wait = require('timers-ext/promise/sleep');
    await wait(); // Ensure access to "processSpanPromise"

    const resolveInput = require('../lib/cli/resolve-input');

    let commands;
    let isHelpRequest;
    // Parse args against schemas of commands which do not require to be run in service context
    ({ command, commands, options, isHelpRequest, commandSchema } = resolveInput(
      require('../lib/cli/commands-schema/no-service')
    ));

    // If version number request, show it and abort
    if (options.version) {
      await require('../lib/cli/render-version')();
      return;
    }

    const ServerlessError = require('../lib/serverless-error');

    // Abort if command is not supported in this environment
    if (commandSchema && commandSchema.isHidden && commandSchema.noSupportNotice) {
      throw new ServerlessError(
        `Cannot run \`${command}\` command: ${commandSchema.noSupportNotice}`
      );
    }

    const path = require('path');
    const uuid = require('uuid');
    const _ = require('lodash');
    const Serverless = require('../lib/Serverless');
    const resolveVariables = require('../lib/configuration/variables/resolve');
    const isPropertyResolved = require('../lib/configuration/variables/is-property-resolved');
    const eventuallyReportVariableResolutionErrors = require('../lib/configuration/variables/eventually-report-resolution-errors');
    const filterSupportedOptions = require('../lib/cli/filter-supported-options');
    const logDeprecation = require('../lib/utils/logDeprecation');

    let configurationPath = null;
    let providerName;
    let variablesMeta;
    let resolverConfiguration;
    let isInteractiveSetup;

    const ensureResolvedProperty = (propertyPath, { shouldSilentlyReturnIfLegacyMode } = {}) => {
      if (isPropertyResolved(variablesMeta, propertyPath)) return true;
      variablesMeta = null;
      if (isHelpRequest) return false;
      const humanizedPropertyPath = humanizePropertyPathKeys(propertyPath.split('\0'));
      if (!shouldSilentlyReturnIfLegacyMode || configuration.variablesResolutionMode) {
        throw new ServerlessError(
          `Cannot resolve ${path.basename(
            configurationPath
          )}: "${humanizedPropertyPath}" property is not accessible ` +
            '(configured behind variables which cannot be resolved at this stage)'
        );
      }
      logDeprecation(
        'NEW_VARIABLES_RESOLVER',
        `"${humanizedPropertyPath}" is not accessible ` +
          '(configured behind variables which cannot be resolved at this stage).\n' +
          'Starting with next major release, ' +
          'this will be communicated with a thrown error.\n' +
          'Set "variablesResolutionMode: 20210326" in your service config, ' +
          'to adapt to this behavior now',
        { serviceConfig: configuration }
      );
      return false;
    };

    if (!commandSchema || commandSchema.serviceDependencyMode) {
      // Command is potentially service specific, follow up with resolution of service config

      isInteractiveSetup = !isHelpRequest && command === '';

      const resolveConfigurationPath = require('../lib/cli/resolve-configuration-path');
      const readConfiguration = require('../lib/configuration/read');

      // Resolve eventual service configuration path
      configurationPath = await resolveConfigurationPath();

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
        serviceDir = process.cwd();
        if (!commandSchema) {
          // If command was not recognized in first resolution phase
          // parse args again also against schemas of commands which require service context
          resolveInput.clear();
          ({ command, commands, options, isHelpRequest, commandSchema } = resolveInput(
            require('../lib/cli/commands-schema/service')
          ));
        }

        // IIFE for maintanance convenience
        await (async () => {
          if (_.get(configuration.provider, 'variableSyntax')) {
            // Request to rely on old variables resolver explictly
            // abort (fallback to legacy internal resolution)
            if (isHelpRequest) return;
            if (configuration.variablesResolutionMode) {
              throw new ServerlessError(
                `Cannot resolve ${path.basename(
                  configurationPath
                )}: "variableSyntax" is not supported with new variables resolver. ` +
                  'Please drop this setting'
              );
            }
            logDeprecation(
              'NEW_VARIABLES_RESOLVER',
              'Serverless Framework was enhanced with a new variables resolver ' +
                'which doesn\'t recognize "provider.variableSyntax" setting.' +
                "Starting with a new major it will be the only resolver that's used." +
                '. Drop setting from a configuration to adapt to it',
              { serviceConfig: configuration }
            );
            return;
          }

          const resolveVariablesMeta = require('../lib/configuration/variables/resolve-meta');
          const resolveProviderName = require('../lib/configuration/resolve-provider-name');

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

          // "variablesResolutionMode" must not be configured with variables as it influences
          // variable resolution choices
          if (!ensureResolvedProperty('variablesResolutionMode')) return;
          if (!ensureResolvedProperty('disabledDeprecations')) return;

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
            resolveInput.clear();
            ({ command, commands, options, isHelpRequest, commandSchema } = resolveInput(
              require('../lib/cli/commands-schema/aws-service')
            ));
          }

          if (variablesMeta.size) {
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
              },
              options: filterSupportedOptions(options, { commandSchema, providerName }),
              fulfilledSources: new Set(['file', 'self', 'strToBool']),
              propertyPathsToResolve: new Set(['provider\0name', 'provider\0stage', 'useDotenv']),
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
                resolveInput.clear();
                ({ command, commands, options, isHelpRequest, commandSchema } = resolveInput(
                  require('../lib/cli/commands-schema/aws-service')
                ));

                if (commandSchema) {
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

            if (
              !ensureResolvedProperty('provider\0stage', { shouldSilentlyReturnIfLegacyMode: true })
            ) {
              // Hack to not duplicate the warning with similar deprecation
              logDeprecation.triggeredDeprecations.add('VARIABLES_ERROR_ON_UNRESOLVED');
              return;
            }

            if (!ensureResolvedProperty('useDotenv')) return;
          }

          // Load eventual environment variables from .env files
          await require('../lib/cli/conditionally-load-dotenv')(options, configuration);

          if (!variablesMeta.size) return; // No properties configured with variables

          resolverConfiguration.fulfilledSources.add('env');

          if (isHelpRequest || commands[0] === 'plugin') {
            // We do not need full config resolved, we just need to know what
            // provider is service setup with, and with what eventual plugins Framework is extended
            // as that influences what CLI commands and options could be used,
            resolverConfiguration.propertyPathsToResolve.add('plugins');
          } else {
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

          if (!providerName) {
            if (!ensureResolvedProperty('provider\0name')) return;
            providerName = resolveProviderName(configuration);
            if (providerName == null) {
              variablesMeta = null;
              return;
            }
            if (!commandSchema && providerName === 'aws') {
              resolveInput.clear();
              ({ command, commands, options, isHelpRequest, commandSchema } = resolveInput(
                require('../lib/cli/commands-schema/aws-service')
              ));
              if (commandSchema) {
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

          if (!variablesMeta.size) return; // All properties successuflly resolved

          if (!ensureResolvedProperty('plugins')) return;

          if (!ensureResolvedProperty('frameworkVersion')) return;
          if (!ensureResolvedProperty('configValidationMode')) return;
          if (!ensureResolvedProperty('app')) return;
          if (!ensureResolvedProperty('org')) return;
          if (!ensureResolvedProperty('service', { shouldSilentlyReturnIfLegacyMode: true })) {
            return;
          }
          if (configuration.org) {
            // Dashboard requires AWS region to be resolved upfront
            ensureResolvedProperty('provider\0region', { shouldSilentlyReturnIfLegacyMode: true });
          }
        })();
      } else {
        // In non-service context we recognize all AWS service commands
        resolveInput.clear();
        ({ command, commands, options, isHelpRequest, commandSchema } = resolveInput(
          require('../lib/cli/commands-schema/aws-service')
        ));

        // Validate result command and options
        require('../lib/cli/ensure-supported-command')();
      }
    }

    const configurationFilename = configuration && configurationPath.slice(serviceDir.length + 1);

    if (isInteractiveSetup) {
      require('../lib/cli/ensure-supported-command')(configuration);

      if (!process.stdin.isTTY && !process.env.SLS_INTERACTIVE_SETUP_ENABLE) {
        throw new ServerlessError(
          'Attempted to run an interactive setup in non TTY environment.\n' +
            "If that's intentended enforce with SLS_INTERACTIVE_SETUP_ENABLE=1 environment variable",
          'INTERACTIVE_SETUP_IN_NON_TTY'
        );
      }
      await require('../lib/cli/interactive-setup')({
        configuration,
        serviceDir,
        configurationFilename,
        options,
      });
      hasTelemetryBeenReported = true;
      if (!isTelemetryDisabled) {
        await storeTelemetryLocally(
          await generateTelemetryPayload({
            command,
            options,
            commandSchema,
            serviceDir,
            configuration,
          })
        );
        await sendTelemetry({ serverlessExecutionSpan: processSpanPromise });
      }
      return;
    }

    serverless = new Serverless({
      configuration,
      serviceDir,
      configurationFilename,
      isConfigurationResolved:
        commands[0] === 'plugin' || Boolean(variablesMeta && !variablesMeta.size),
      hasResolvedCommandsExternally: true,
      isTelemetryReportedExternally: true,
      commands,
      options,
    });

    try {
      serverless.onExitPromise = processSpanPromise;
      serverless.invocationId = uuid.v4();
      await serverless.init();
      if (serverless.invokedInstance) {
        // Local (in service) installation was found and initialized internally,
        // From now on refer to it only
        serverless.invokedInstance.invocationId = serverless.invocationId;
        serverless = serverless.invokedInstance;
      }

      // IIFE for maintanance convenience
      await (async () => {
        if (!configuration) return;
        let hasFinalCommandSchema = null;
        if (configuration.plugins) {
          // After plugins are loaded, re-resolve CLI command and options schema as plugin
          // might have defined extra commands and options

          // TODO: Remove "serverless.pluginManager.externalPlugins" check with next major
          if (serverless.pluginManager.externalPlugins) {
            if (serverless.pluginManager.externalPlugins.size) {
              const commandsSchema = require('../lib/cli/commands-schema/resolve-final')(
                serverless.pluginManager.externalPlugins,
                { providerName: providerName || 'aws', configuration }
              );
              resolveInput.clear();
              ({ command, commands, options, isHelpRequest, commandSchema } =
                resolveInput(commandsSchema));
              serverless.processedInput.commands = serverless.pluginManager.cliCommands = commands;
              serverless.processedInput.options = serverless.pluginManager.cliOptions = options;
              hasFinalCommandSchema = true;
            }
          } else {
            // Invocation fallen back to old Framework version, where we do not have easily
            // accessible info on loaded plugins
            // 1. Skip further variables resolution
            variablesMeta = null;
            // 2. Avoid command validation
            hasFinalCommandSchema = false;
          }
        }
        if (!providerName && !hasFinalCommandSchema) {
          // Invalid configuration, ensure to recognize all AWS commands
          resolveInput.clear();
          ({ command, commands, options, isHelpRequest, commandSchema } = resolveInput(
            require('../lib/cli/commands-schema/aws-service')
          ));
        }
        if (hasFinalCommandSchema == null) hasFinalCommandSchema = true;

        // Validate result command and options
        if (hasFinalCommandSchema) require('../lib/cli/ensure-supported-command')(configuration);
        if (isHelpRequest) return;
        if (!_.get(variablesMeta, 'size')) return;

        // Resolve remaininig service configuration variables
        if (providerName === 'aws') {
          // Ensure properties which are crucial to some variable source resolvers
          // are actually resolved.
          if (
            !ensureResolvedProperty('provider\0credentials', {
              shouldSilentlyReturnIfLegacyMode: true,
            }) ||
            !ensureResolvedProperty('provider\0deploymentBucket\0serverSideEncryption', {
              shouldSilentlyReturnIfLegacyMode: true,
            }) ||
            !ensureResolvedProperty('provider\0profile', {
              shouldSilentlyReturnIfLegacyMode: true,
            }) ||
            !ensureResolvedProperty('provider\0region', {
              shouldSilentlyReturnIfLegacyMode: true,
            })
          ) {
            return;
          }
        }
        if (commandSchema) {
          resolverConfiguration.options = filterSupportedOptions(options, {
            commandSchema,
            providerName,
          });
        }
        if (configuration.variablesResolutionMode >= 20210326) {
          // New resolver, resolves just recognized CLI options. Therefore we cannot assume
          // we have full "opt" source data if user didn't explicitly switch to new resolver
          resolverConfiguration.fulfilledSources.add('opt');
        }

        // Register serverless instance and AWS provider specific variable sources
        resolverConfiguration.sources.sls =
          require('../lib/configuration/variables/sources/instance-dependent/get-sls')(serverless);
        resolverConfiguration.fulfilledSources.add('sls');

        if (providerName === 'aws') {
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
          });
          resolverConfiguration.fulfilledSources.add('cf').add('s3').add('ssm');
        }

        // Register dashboard specific variable source resolvers
        if (configuration.org && serverless.pluginManager.dashboardPlugin) {
          for (const [sourceName, sourceConfig] of Object.entries(
            serverless.pluginManager.dashboardPlugin.configurationVariablesSources
          )) {
            resolverConfiguration.sources[sourceName] = sourceConfig;
            resolverConfiguration.fulfilledSources.add(sourceName);
          }
        }

        const ensurePlainFunction = require('type/plain-function/ensure');
        const ensurePlainObject = require('type/plain-object/ensure');

        // Register variable source resolvers provided by external plugins
        for (const externalPlugin of serverless.pluginManager.externalPlugins) {
          const pluginName = externalPlugin.constructor.name;
          if (externalPlugin.configurationVariablesSources != null) {
            ensurePlainObject(externalPlugin.configurationVariablesSources, {
              errorMessage:
                'Invalid "configurationVariablesSources" ' +
                `configuration on "${pluginName}", expected object, got: %v"`,
              Error: ServerlessError,
            });

            for (const [sourceName, sourceConfig] of Object.entries(
              externalPlugin.configurationVariablesSources
            )) {
              if (resolverConfiguration.sources[sourceName]) {
                throw new ServerlessError(
                  `Cannot add "${sourceName}" configuration variable source ` +
                    `(through "${pluginName}" plugin) as resolution rules ` +
                    'for this source name are already configured'
                );
              }
              ensurePlainFunction(
                ensurePlainObject(sourceConfig, {
                  errorMessage:
                    `Invalid "configurationVariablesSources.${sourceName}" ` +
                    `configuration on "${pluginName}", expected object, got: %v"`,
                  Error: ServerlessError,
                }).resolve,
                {
                  errorMessage:
                    `Invalid "configurationVariablesSources.${sourceName}.resolve" ` +
                    `value on "${pluginName}", expected function, got: %v"`,
                  Error: ServerlessError,
                }
              );

              resolverConfiguration.sources[sourceName] = sourceConfig;
              resolverConfiguration.fulfilledSources.add(sourceName);
            }
          } else if (
            externalPlugin.variableResolvers &&
            configuration.variablesResolutionMode < 20210326
          ) {
            logDeprecation(
              'NEW_VARIABLES_RESOLVER',
              `Plugin "${pluginName}" attempts to extend old variables resolver. ` +
                'Ensure to rely on latest version of a plugin and if this warning is ' +
                'still displayed please report the problem at plugin issue tracker' +
                'Starting with next major release, ' +
                'old variables resolver will not be supported.\n',
              { serviceConfig: configuration }
            );
          }
        }

        // Having all source resolvers configured, resolve variables
        await resolveVariables(resolverConfiguration);
        if (!variablesMeta.size) {
          serverless.isConfigurationInputResolved = true;
          return;
        }
        if (
          eventuallyReportVariableResolutionErrors(configurationPath, configuration, variablesMeta)
        ) {
          return;
        }

        // Report unrecognized variable sources found in variables configured in service config
        const unresolvedSources =
          require('../lib/configuration/variables/resolve-unresolved-source-types')(variablesMeta);
        if (!(configuration.variablesResolutionMode >= 20210326)) {
          const legacyCfVarPropertyPaths = new Set();
          const legacySsmVarPropertyPaths = new Set();
          for (const [sourceType, propertyPaths] of unresolvedSources) {
            if (sourceType.startsWith('cf.')) {
              for (const propertyPath of propertyPaths) legacyCfVarPropertyPaths.add(propertyPath);
              unresolvedSources.delete(sourceType);
            }
            if (sourceType.startsWith('ssm.')) {
              for (const propertyPath of propertyPaths) legacySsmVarPropertyPaths.add(propertyPath);
              unresolvedSources.delete(sourceType);
            }
          }
          if (legacyCfVarPropertyPaths.size) {
            logDeprecation(
              'NEW_VARIABLES_RESOLVER',
              'Syntax for referencing CF outputs was upgraded to ' +
                '"${cf(<region>):stackName.outputName}" (while  ' +
                '"${cf.<region>:stackName.outputName}" is now deprecated, ' +
                'as not supported by new variables resolver).\n' +
                'Please upgrade to use new form instead.' +
                'Starting with next major release, ' +
                'this will be communicated with a thrown error.\n',
              { serviceConfig: configuration }
            );
          }
          if (legacySsmVarPropertyPaths.size) {
            logDeprecation(
              'NEW_VARIABLES_RESOLVER',
              'Syntax for referencing SSM parameters was upgraded to ' +
                '"${ssm(<region>):parameter-path}" (while  ' +
                '"${ssm.<region>:parameter-path}" is now deprecated, ' +
                'as not supported by new variables resolver).\n' +
                'Please upgrade to use new form instead.' +
                'Starting with next major release, ' +
                'this will be communicated with a thrown error.\n',
              { serviceConfig: configuration }
            );
          }
          const recognizedSourceNames = new Set(Object.keys(resolverConfiguration.sources));
          const unrecognizedSourceNames = Array.from(unresolvedSources.keys()).filter(
            (sourceName) => !recognizedSourceNames.has(sourceName)
          );
          if (unrecognizedSourceNames.length) {
            logDeprecation(
              'NEW_VARIABLES_RESOLVER',
              `Approached unrecognized configuration variable sources: "${unrecognizedSourceNames.join(
                '", "'
              )}".\n` +
                'From a next major this will be communicated with a thrown error.\n' +
                'Set "variablesResolutionMode: 20210326" in your service config, ' +
                'to adapt to new behavior now',
              { serviceConfig: configuration }
            );
          }
        } else {
          throw new ServerlessError(
            `Approached unrecognized configuration variable sources: "${Array.from(
              unresolvedSources.keys()
            ).join('", "')}"`,
            'UNRECOGNIZED_VARIABLE_SOURCES'
          );
        }
      })();

      if (isHelpRequest && serverless.pluginManager.externalPlugins) {
        // Show help
        require('../lib/cli/render-help')(serverless.pluginManager.externalPlugins);
      } else {
        // Run command
        await serverless.run();
      }

      hasTelemetryBeenReported = true;
      if (!isTelemetryDisabled && !isHelpRequest && serverless.isTelemetryReportedExternally) {
        await storeTelemetryLocally({
          ...(await generateTelemetryPayload({
            command,
            options,
            commandSchema,
            serviceDir,
            configuration,
            serverless,
          })),
          outcome: 'success',
        });
        let backendNotificationRequest;
        if (commands.join(' ') === 'deploy') {
          backendNotificationRequest = await sendTelemetry({
            serverlessExecutionSpan: processSpanPromise,
          });
        }
        if (backendNotificationRequest) {
          await processBackendNotificationRequest(backendNotificationRequest);
        }
      }
    } catch (error) {
      // If Dashboard Plugin, capture error
      const dashboardPlugin =
        serverless.pluginManager.dashboardPlugin ||
        serverless.pluginManager.plugins.find((p) => p.enterprise);
      const dashboardErrorHandler = _.get(dashboardPlugin, 'enterprise.errorHandler');
      if (!dashboardErrorHandler) throw error;
      try {
        await dashboardErrorHandler(error, serverless.invocationId);
      } catch (dashboardErrorHandlerError) {
        const log = require('@serverless/utils/log');
        const tokenizeException = require('../lib/utils/tokenize-exception');
        const exceptionTokens = tokenizeException(dashboardErrorHandlerError);
        log(
          `Publication to Serverless Dashboard errored with:\n${' '.repeat('Serverless: '.length)}${
            exceptionTokens.isUserError || !exceptionTokens.stack
              ? exceptionTokens.message
              : exceptionTokens.stack
          }`,
          { color: 'orange' }
        );
      }
      throw error;
    }
  } catch (error) {
    handleError(error, {
      command,
      options,
      commandSchema,
      serviceDir,
      configuration,
      serverless,
      hasTelemetryBeenReported,
    });
  }
})();
