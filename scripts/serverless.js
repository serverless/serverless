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

let serverless;

process.once('uncaughtException', (error) =>
  handleError(error, {
    isUncaughtException: true,
    isLocallyInstalled: serverless && serverless.isLocallyInstalled,
    isInvokedByGlobalInstallation: serverless && serverless.isInvokedByGlobalInstallation,
  })
);

const processSpanPromise = (async () => {
  try {
    const wait = require('timers-ext/promise/sleep');
    await wait(); // Ensure access to "processSpanPromise"

    // Propagate (in a background) eventual pending analytics requests
    require('../lib/utils/analytics').sendPending({
      serverlessExecutionSpan: processSpanPromise,
    });

    const resolveInput = require('../lib/cli/resolve-input');

    // Parse args against schemas of commands which do not require to be run in service context
    let { command, commands, options, isHelpRequest, commandSchema } = resolveInput(
      require('../lib/cli/commands-schema/no-service')
    );

    // If version number request, show it and abort
    if (options.version) {
      await require('../lib/cli/render-version')();
      return;
    }

    const ServerlessError = require('../lib/serverless-error');
    if (commandSchema && commandSchema.isHidden && commandSchema.noSupportNotice) {
      throw new ServerlessError(
        `Cannot run \`${command}\` command: ${commandSchema.noSupportNotice}`
      );
    }

    const uuid = require('uuid');
    const _ = require('lodash');
    const Serverless = require('../lib/Serverless');
    const resolveVariables = require('../lib/configuration/variables/resolve');
    const eventuallyReportVariableResolutionErrors = require('../lib/configuration/variables/eventually-report-resolution-errors');
    const filterSupportedOptions = require('../lib/cli/filter-supported-options');

    let configurationPath = null;
    let configuration = null;
    let providerName;
    let variablesMeta;
    let resolverConfiguration;

    if (!commandSchema || commandSchema.serviceDependencyMode) {
      const resolveConfigurationPath = require('../lib/cli/resolve-configuration-path');
      const readConfiguration = require('../lib/configuration/read');
      const logDeprecation = require('../lib/utils/logDeprecation');

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
        const path = require('path');

        if (!commandSchema) {
          // If command was not recognized in first resolution phase
          // Parse args again also against schemas commands which require service to be run
          resolveInput.clear();
          ({ command, commands, options, isHelpRequest, commandSchema } = resolveInput(
            require('../lib/cli/commands-schema/service')
          ));
        }

        // IIFE for maintanance convenience
        await (async () => {
          if (_.get(configuration.provider, 'variableSyntax')) {
            // Request to rely on old variables resolver explictly, abort
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
          const isPropertyResolved = require('../lib/configuration/variables/is-property-resolved');

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

          const ensureResolvedProperty = (
            propertyPath,
            { shouldSilentlyReturnIfLegacyMode } = {}
          ) => {
            if (isPropertyResolved(variablesMeta, propertyPath)) return true;
            variablesMeta = null;
            if (isHelpRequest) return false;
            const humianizedPropertyPath = humanizePropertyPathKeys(propertyPath.split('\0'));
            if (!shouldSilentlyReturnIfLegacyMode || configuration.variablesResolutionMode) {
              throw new ServerlessError(
                `Cannot resolve ${path.basename(
                  configurationPath
                )}: "${humianizedPropertyPath}" property is not accessible ` +
                  '(configured behind variables which cannot be resolved at this stage)'
              );
            }
            logDeprecation(
              'NEW_VARIABLES_RESOLVER',
              `"${humianizedPropertyPath}" is not accessible ' +
                '(configured behind variables which cannot be resolved at this stage).\n' +
                'Starting with next major release, ' +
                'this will be communicated with a thrown error.\n' +
                'Set "variablesResolutionMode: 20210219" in your service config, ' +
                'to adapt to this behavior now`,
              { serviceConfig: configuration }
            );
            return false;
          };

          // "variablesResolutionMode" must not be configured with variables as it influences
          // variable resolution choices
          if (!ensureResolvedProperty('variablesResolutionMode')) return;
          if (!ensureResolvedProperty('disabledDeprecations')) return;

          if (isPropertyResolved(variablesMeta, 'provider\0name')) {
            providerName = resolveProviderName(configuration);
          }
          if (!commandSchema && providerName === 'aws') {
            // If command was not recognized in first resolution phase
            // Parse args again also against schemas commands which require AWS service to be run
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
              servicePath: process.cwd(),
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

          // Resolve all unresolved configuration properties
          resolverConfiguration.fulfilledSources.add('env');

          if (isHelpRequest) {
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
        })();
      } else {
        // In non-service context we recognize all AWS service commands
        resolveInput.clear();
        ({ command, commands, options, isHelpRequest, commandSchema } = resolveInput(
          require('../lib/cli/commands-schema/aws-service')
        ));
        require('../lib/cli/ensure-supported-command')();
      }
    }

    serverless = new Serverless({
      configuration,
      configurationPath: configuration && configurationPath,
      isConfigurationResolved: Boolean(variablesMeta && !variablesMeta.size),
      hasResolvedCommandsExternally: true,
      commands,
      options,
    });

    try {
      serverless.onExitPromise = processSpanPromise;
      serverless.invocationId = uuid.v4();
      await serverless.init();
      if (serverless.invokedInstance) {
        serverless.invokedInstance.invocationId = serverless.invocationId;
        serverless = serverless.invokedInstance;
      }

      // IIFE for maintanance convenience
      await (async () => {
        if (!configuration) return;
        let hasFinalCommandSchema = false;
        if (configuration.plugins) {
          // TODO: Remove "serverless.pluginManager.externalPlugins" check with next major
          if (serverless.pluginManager.externalPlugins) {
            if (serverless.pluginManager.externalPlugins.size) {
              // After plugins are loaded, re-resolve CLI command and options schema as plugin
              // might have defined extra commands and options
              const commandsSchema = require('../lib/cli/commands-schema/resolve-final')(
                serverless.pluginManager.externalPlugins,
                { providerName: providerName || 'aws' }
              );
              resolveInput.clear();
              ({ command, commands, options, isHelpRequest, commandSchema } = resolveInput(
                commandsSchema
              ));
              serverless.processedInput.commands = serverless.pluginManager.cliCommands = commands;
              serverless.processedInput.options = serverless.pluginManager.cliOptions = options;
              hasFinalCommandSchema = true;
            }
          } else {
            // Invocation fallen back to old Framework version. As we do not have easily
            // accessible info on loaded plugins, skip further variables resolution
            variablesMeta = null;
          }
        }
        if (!providerName && !hasFinalCommandSchema) {
          // Invalid configuration, ensure to recognize all AWS commands
          resolveInput.clear();
          ({ command, commands, options, isHelpRequest, commandSchema } = resolveInput(
            require('../lib/cli/commands-schema/aws-service')
          ));
        }

        require('../lib/cli/ensure-supported-command')();
        if (isHelpRequest) return;
        if (!_.get(variablesMeta, 'size')) return;

        if (commandSchema) {
          resolverConfiguration.options = filterSupportedOptions(options, {
            commandSchema,
            providerName,
          });
        }
        resolverConfiguration.sources.sls = require('../lib/configuration/variables/sources/instance-dependent/get-sls')(
          serverless
        );
        resolverConfiguration.fulfilledSources.add('opt').add('sls');
        await resolveVariables(resolverConfiguration);
        eventuallyReportVariableResolutionErrors(configurationPath, configuration, variablesMeta);
      })();

      if (isHelpRequest && serverless.pluginManager.externalPlugins) {
        require('../lib/cli/render-help')(serverless.pluginManager.externalPlugins);
      } else {
        await serverless.run();
      }
    } catch (error) {
      // If Enterprise Plugin, capture error
      let enterpriseErrorHandler = null;
      serverless.pluginManager.plugins.forEach((p) => {
        if (p.enterprise && p.enterprise.errorHandler) {
          enterpriseErrorHandler = p.enterprise.errorHandler;
        }
      });
      if (!enterpriseErrorHandler) throw error;
      try {
        await enterpriseErrorHandler(error, serverless.invocationId);
      } catch (enterpriseErrorHandlerError) {
        const log = require('@serverless/utils/log');
        const tokenizeException = require('../lib/utils/tokenize-exception');
        const exceptionTokens = tokenizeException(enterpriseErrorHandlerError);
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
      isLocallyInstalled: serverless && serverless.isLocallyInstalled,
      isInvokedByGlobalInstallation: serverless && serverless.isInvokedByGlobalInstallation,
    });
  }
})();
