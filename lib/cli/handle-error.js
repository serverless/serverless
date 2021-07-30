'use strict';

const path = require('path');
const isObject = require('type/object/is');
const chalk = require('chalk');
const isStandaloneExecutable = require('../utils/isStandaloneExecutable');
const resolveLocalServerlessPath = require('./resolve-local-serverless-path');
const slsVersion = require('./../../package').version;
const sfeVersion = require('@serverless/dashboard-plugin/package.json').version;
const { platformClientVersion } = require('@serverless/dashboard-plugin');
const ServerlessError = require('../serverless-error');
const tokenizeException = require('../utils/tokenize-exception');
const logDeprecation = require('../utils/logDeprecation');
const resolveIsLocallyInstalled = require('../utils/is-locally-installed');
const isTelemetryDisabled = require('../utils/telemetry/areDisabled');
const { storeLocally: storeTelemetryLocally, send: sendTelemetry } = require('../utils/telemetry');
const generateTelemetryPayload = require('../utils/telemetry/generatePayload');
const resolveErrorLocation = require('../utils/telemetry/resolve-error-location');
const resolveInput = require('./resolve-input');

const consoleLog = (message) => process.stdout.write(`${message}\n`);

const writeMessage = (title, message) => {
  let line = '';
  while (line.length < 56 - title.length) {
    line = `${line}-`;
  }

  process.stdout.write(' \n');
  consoleLog(chalk.yellow(` ${title} ${line}`));
  consoleLog(' ');

  if (message) {
    consoleLog(`  ${message.split('\n').join('\n  ')}`);
  }

  consoleLog(' ');
};

const isErrorCodeNormative = RegExp.prototype.test.bind(/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/);

module.exports = async (exception, options = {}) => {
  if (!isObject(options)) options = {};
  // Due to the fact that the handler can be invoked via fallback, we need to support both `serverless`
  // and `isLocallyInstalled` + `isInvokedByGlobalInstallation` properties
  // TODO: Support for these properties should be removed with next major
  const {
    isUncaughtException,
    isLocallyInstalled: passedIsLocallyInstalled,
    isInvokedByGlobalInstallation: passedIsInvokedByGlobalInstallation,
    serverless,
    hasTelemetryBeenReported,
    commandUsage,
    variableSourcesInConfig,
  } = options;
  let { command, options: cliOptions, commandSchema, serviceDir, configuration } = options;

  const isLocallyInstalled = serverless ? serverless.isLocallyInstalled : passedIsLocallyInstalled;
  const isInvokedByGlobalInstallation = serverless
    ? serverless.isInvokedByGlobalInstallation
    : passedIsInvokedByGlobalInstallation;

  // If provided serverless instance is a local fallback, and we're not in context of it
  // Pass error handling to this local fallback implementation
  if (isInvokedByGlobalInstallation && !resolveIsLocallyInstalled()) {
    const localServerlessPath = resolveLocalServerlessPath();

    try {
      // Attempt to use error handler from local version
      // TODO: Remove local version fallback with next major (when its moved to the top of the process)
      try {
        require(path.resolve(localServerlessPath, 'lib/cli/handle-error'))(exception, {
          serverless,
          isLocallyInstalled,
          isUncaughtException,
          command,
          options: cliOptions,
          commandSchema,
          serviceDir,
          configuration,
          hasTelemetryBeenReported,
          commandUsage,
          variableSourcesInConfig,
        });
        return;
      } catch (error) {
        // Pass and attempt to use old-style error handler from local version

        // Ugly mock of serverless below is used to ensure that Framework version will be logged with `(local)` suffix
        require(path.resolve(localServerlessPath, 'lib/classes/Error')).logError(exception, {
          serverless: serverless || { isLocallyInstalled },
          forceExit: isUncaughtException,
        });
        return;
      }
    } catch (err) {
      // This is just a fallback as for most (all?) versions it shouldn't happen
      throw new ServerlessError(
        'Could not resolve path to locally installed error handler.',
        'INVALID_LOCAL_SERVERLESS_ERROR_HANDLER'
      );
    }
  }

  const exceptionTokens = tokenizeException(exception);
  const isUserError = !isUncaughtException && exceptionTokens.isUserError;

  writeMessage(
    exceptionTokens.title,
    exceptionTokens.stack && (!isUserError || process.env.SLS_DEBUG)
      ? exceptionTokens.stack
      : exceptionTokens.message
  );

  if (!isUserError && !process.env.SLS_DEBUG) {
    const debugInfo = [
      '    ',
      ' For debugging logs, run again after setting the',
      ' "SLS_DEBUG=*" environment variable.',
    ].join('');
    consoleLog(chalk.red(debugInfo));
    consoleLog(' ');
  }

  const platform = process.platform;
  const nodeVersion = process.version.replace(/^[v|V]/, '');

  consoleLog(chalk.yellow('  Get Support --------------------------------------------'));
  consoleLog(`${chalk.yellow('     Docs:          ')}docs.serverless.com`);
  consoleLog(`${chalk.yellow('     Bugs:          ')}github.com/serverless/serverless/issues`);
  consoleLog(`${chalk.yellow('     Issues:        ')}forum.serverless.com`);

  consoleLog(' ');
  consoleLog(chalk.yellow('  Your Environment Information ---------------------------'));
  consoleLog(chalk.yellow(`     Operating System:          ${platform}`));
  consoleLog(chalk.yellow(`     Node Version:              ${nodeVersion}`));

  const installationModePostfix = await (async () => {
    if (isStandaloneExecutable) return ' (standalone)';
    if (isLocallyInstalled != null) return isLocallyInstalled ? ' (local)' : '';
    return resolveIsLocallyInstalled() ? ' (local)' : '';
  })();
  consoleLog(
    chalk.yellow(`     Framework Version:         ${slsVersion}${installationModePostfix}`)
  );
  consoleLog(chalk.yellow(`     Plugin Version:            ${sfeVersion}`));
  consoleLog(chalk.yellow(`     SDK Version:               ${platformClientVersion}`));

  const componentsVersion = (() => {
    try {
      return require('@serverless/components/package').version;
    } catch (error) {
      return 'Unavailable';
    }
  })();
  consoleLog(chalk.yellow(`     Components Version:        ${componentsVersion}`));
  consoleLog(' ');

  logDeprecation.printSummary();

  if (
    !isTelemetryDisabled &&
    hasTelemetryBeenReported === false &&
    (serverless ? serverless.isTelemetryReportedExternally : true)
  ) {
    if (command == null) {
      // We're in local fallback and older global didn't pass CLI command data, resolve it here
      if (serverless) {
        configuration = serverless.configurationInput;
        serviceDir = serverless.serviceDir;
      }
      const commandsSchema = configuration
        ? require('./commands-schema/resolve-final')(serverless.pluginManager.externalPlugins, {
            providerName: serverless.service.provider.name,
            configuration,
          })
        : require('./commands-schema/aws-service');
      ({ command, options: cliOptions, commandSchema } = resolveInput(commandsSchema));
    }

    if (commandSchema) {
      // Report only for recognized commands
      const telemetryPayload = generateTelemetryPayload({
        command,
        options: cliOptions,
        commandSchema,
        serviceDir,
        configuration,
        serverless,
        commandUsage,
        variableSources: variableSourcesInConfig,
      });
      const failureReason = {
        kind: isUserError ? 'user' : 'programmer',
        code: exception.code,
      };

      if (!isUserError || !exception.code || !isErrorCodeNormative(exception.code)) {
        failureReason.location = resolveErrorLocation(exceptionTokens);
      }
      storeTelemetryLocally({ ...telemetryPayload, failureReason, outcome: 'failure' });
      await sendTelemetry();
    }
  }

  process.exitCode = 1;
  if (isUncaughtException) process.exit();
};
