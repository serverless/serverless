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

    const { commands, options, isHelpRequest } = require('../lib/cli/resolve-input')();

    // If version number request, show it and abort
    if (options.version) {
      await require('../lib/cli/list-version')();
      return;
    }

    const ServerlessError = require('../lib/serverless-error');
    const commandsSchema = require('../lib/cli/commands-schema');
    const command = commands.join(' ');
    const commandSchema = commandsSchema.get(command);
    if (commandSchema && commandSchema.isHidden && commandSchema.noSupportNotice) {
      throw new ServerlessError(
        `Cannot run \`${command}\` command: ${commandSchema.noSupportNotice}`
      );
    }

    const uuid = require('uuid');
    const _ = require('lodash');
    const Serverless = require('../lib/Serverless');

    let configurationPath = null;
    let configuration = null;
    let variablesMeta;

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
        const resolveVariables = require('../lib/configuration/variables/resolve');
        const humanizePropertyPathKeys = require('../lib/configuration/variables/humanize-property-path-keys');
        const eventuallyReportVariableResolutionErrors = require('../lib/configuration/variables/eventually-report-resolution-errors');
        let resolverConfiguration;

        await (async () => {
          if (_.get(configuration.provider, 'variableSyntax')) {
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
          variablesMeta = resolveVariablesMeta(configuration);

          if (variablesMeta.size) {
            if (variablesMeta.has('variablesResolutionMode')) {
              variablesMeta = null;
              if (isHelpRequest) return;
              throw new ServerlessError(
                `Cannot resolve ${path.basename(
                  configurationPath
                )}: "variablesResolutionMode" is not accessible ` +
                  '(configured behind variables which cannot be resolved at this stage)'
              );
            }

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
              options,
              fulfilledSources: new Set(['file', 'self', 'strToBool']),
            };
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

            // There are few configuration properties, which have to be resolved at this point
            // to move forward. Report errors if that's not the case
            if (variablesMeta.has('provider')) {
              variablesMeta = null;
              if (isHelpRequest) return;
              throw new ServerlessError(
                `Cannot resolve ${path.basename(
                  configurationPath
                )}: "provider" section is not accessible ` +
                  '(configured behind variables which cannot be resolved at this stage)'
              );
            }
            if (variablesMeta.has('provider\0stage')) {
              variablesMeta = null;
              if (isHelpRequest) return;
              if (configuration.variablesResolutionMode) {
                throw new ServerlessError(
                  `Cannot resolve ${path.basename(
                    configurationPath
                  )}: "provider.stage" property is not accessible ` +
                    '(configured behind variables which cannot be resolved at this stage)'
                );
              }
              logDeprecation(
                'NEW_VARIABLES_RESOLVER',
                '"provider.stage" is not accessible ' +
                  '(configured behind variables which cannot be resolved at this stage).\n' +
                  'Starting with next major release, ' +
                  'this will be communicated with a thrown error.\n' +
                  'Set "variablesResolutionMode: 20210219" in your service config, ' +
                  'to adapt to this behavior now',
                { serviceConfig: configuration }
              );
              // Hack to not duplicate the warning with similar deprecation
              logDeprecation.triggeredDeprecations.add('VARIABLES_ERROR_ON_UNRESOLVED');
              return;
            }

            if (variablesMeta.has('useDotenv')) {
              variablesMeta = null;
              if (isHelpRequest) return;
              throw new ServerlessError(
                `Cannot resolve ${path.basename(
                  configurationPath
                )}: "useDotenv" is not accessible ` +
                  '(configured behind variables which cannot be resolved at this stage)'
              );
            }
          }

          // Load eventual environment variables from .env files
          await require('../lib/cli/conditionally-load-dotenv')(options, configuration);

          if (!variablesMeta.size) return;

          // Resolve all unresolved configuration properties
          resolverConfiguration.fulfilledSources.add('env');
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

          if (!variablesMeta.size) return;
          // At this point we expect "plugins" to be fully resolved to move forward.
          // Report error if that's not the case
          for (const propertyPath of variablesMeta.keys()) {
            if (propertyPath !== 'plugins' && !propertyPath.startsWith('plugins\0')) continue;
            variablesMeta = null;
            if (isHelpRequest) return;
            throw new ServerlessError(
              `Cannot resolve ${path.basename(configurationPath)}: "${humanizePropertyPathKeys(
                propertyPath.split('\0')
              )}" property is not accessible ` +
                '(configured behind variables which cannot be resolved at this stage)'
            );
          }
        })();
      }
    }

    serverless = new Serverless({
      configuration,
      configurationPath: configuration && configurationPath,
      isConfigurationResolved: Boolean(variablesMeta && !variablesMeta.size),
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
      await serverless.run();
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
