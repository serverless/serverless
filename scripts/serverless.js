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
    require('../lib/utils/analytics').sendPending({
      serverlessExecutionSpan: processSpanPromise,
    });
    const { commands, options } = require('../lib/cli/resolve-input')();

    if (options.version) {
      await require('../lib/cli/list-version')();
      return;
    }

    const uuid = require('uuid');
    const _ = require('lodash');
    const Serverless = require('../lib/Serverless');
    const resolveConfigurationPath = require('../lib/cli/resolve-configuration-path');
    const isHelpRequest = require('../lib/cli/is-help-request');
    const readConfiguration = require('../lib/configuration/read');
    const logDeprecation = require('../lib/utils/logDeprecation');

    const configurationPath = await resolveConfigurationPath();
    const configuration = configurationPath
      ? await (async () => {
          try {
            return await readConfiguration(configurationPath);
          } catch (error) {
            // Configuration syntax error should not prevent help from being displayed
            // (if possible configuration should be read for help request as registered
            // plugins may introduce new commands to be listed in help output)
            if (isHelpRequest()) return null;
            throw error;
          }
        })()
      : null;

    if (configuration) {
      if (_.get(configuration.provider, 'variableSyntax')) {
        logDeprecation(
          'NEW_VARIABLES_RESOLVER',
          'Serverless Framework was enhanced with a new variables resolver ' +
            'which doesn\'t recognize "provider.variableSyntax" setting.' +
            "Starting with a new major it will be the only resolver that's used." +
            '. Drop setting from a configuration to adapt to it',
          { serviceConfig: configuration }
        );
      } else {
        const path = require('path');
        const ServerlessError = require('../lib/serverless-error');
        const resolveVariablesMeta = require('../lib/configuration/variables/resolve-meta');
        const resolveVariables = require('../lib/configuration/variables/resolve');
        const variableSources = {
          env: { ...require('../lib/configuration/variables/sources/env'), isIncomplete: true },
          file: require('../lib/configuration/variables/sources/file'),
          opt: require('../lib/configuration/variables/sources/opt'),
          self: require('../lib/configuration/variables/sources/self'),
          strToBool: require('../lib/configuration/variables/sources/str-to-bool'),
        };
        const variablesMeta = resolveVariablesMeta(configuration);
        await resolveVariables({
          servicePath: process.cwd(),
          configuration,
          variablesMeta,
          sources: variableSources,
          options,
        });
        const resolutionErrors = Array.from(variablesMeta.values(), ({ error }) => error).filter(
          Boolean
        );
        if (resolutionErrors.length) {
          if (isHelpRequest()) {
            const log = require('@serverless/utils/log');
            log(
              'Resolution of service configuration failed when resolving variables: ' +
                `${resolutionErrors.map((error) => `\n  - ${error.message}`)}\n`,
              { color: 'orange' }
            );
          } else {
            if (configuration.variablesResolutionMode) {
              throw new ServerlessError(
                `Cannot resolve ${path.basename(
                  configurationPath
                )}: Variables resolution errored with:${resolutionErrors.map(
                  (error) => `\n  - ${error.message}`
                )}\n`
              );
            }
            logDeprecation(
              'NEW_VARIABLES_RESOLVER',
              'Variables resolver reports following resolution errors:' +
                `${resolutionErrors.map((error) => `\n  - ${error.message}`)}\n` +
                'From a next major it we will be communicated with a thrown error.\n' +
                'Set "variablesResolutionMode: 20210219" in your service config, ' +
                'to adapt to this behavior now',
              { serviceConfig: configuration }
            );
            // Hack to not duplicate the warning with similar deprecation
            logDeprecation.triggeredDeprecations.add('VARIABLES_ERROR_ON_UNRESOLVED');
          }
        }
      }
    }

    serverless = new Serverless({
      configuration,
      configurationPath: configuration && configurationPath,
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
        process.stdout.write(`${enterpriseErrorHandlerError.stack}\n`);
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
