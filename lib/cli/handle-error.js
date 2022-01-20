'use strict';

const isObject = require('type/object/is');
const stripAnsi = require('strip-ansi');
const sfeVersion = require('@serverless/dashboard-plugin/package.json').version;
const { platformClientVersion } = require('@serverless/dashboard-plugin');
const { getDashboardProvidersUrl } = require('@serverless/dashboard-plugin/lib/dashboard');
const { style, writeText } = require('@serverless/utils/log');
const slsVersion = require('./../../package').version;
const isStandaloneExecutable = require('../utils/isStandaloneExecutable');
const tokenizeException = require('../utils/tokenize-exception');
const logDeprecation = require('../utils/logDeprecation');
const isLocallyInstalled = require('./is-locally-installed');
const isTelemetryDisabled = require('../utils/telemetry/areDisabled');
const { storeLocally: storeTelemetryLocally, send: sendTelemetry } = require('../utils/telemetry');
const generateTelemetryPayload = require('../utils/telemetry/generatePayload');
const resolveErrorLocation = require('../utils/telemetry/resolve-error-location');

const isErrorCodeNormative = RegExp.prototype.test.bind(/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/);

module.exports = async (exception, options = {}) => {
  if (!isObject(options)) options = {};
  const { serverless, hasTelemetryBeenReported, commandUsage, variableSourcesInConfig } = options;
  const { command, options: cliOptions, commandSchema, serviceDir, configuration } = options;

  const exceptionTokens = tokenizeException(exception);
  const isUserError = exceptionTokens.isUserError;

  const platform = process.platform;
  const nodeVersion = process.version.replace(/^[v|V]/, '');
  const installationModePostfix = (() => {
    if (isStandaloneExecutable) return ' (standalone)';
    return isLocallyInstalled ? ' (local)' : '';
  })();
  const globalInstallationPostfix = (() => {
    if (EvalError.$serverlessInitInstallationVersion) {
      return ` ${EvalError.$serverlessInitInstallationVersion}v (global)`;
    }
    return '';
  })();

  const detailsTextTokens = [
    `Environment: ${platform}, node ${nodeVersion}, ` +
      `framework ${slsVersion}${installationModePostfix}${globalInstallationPostfix}, ` +
      `plugin ${sfeVersion}, SDK ${platformClientVersion}`,
  ];

  if (serverless && serverless.service.provider.name === 'aws') {
    const credentials = serverless.getProvider('aws').cachedCredentials;
    if (credentials) {
      if (credentials.dashboardProviderAlias) {
        detailsTextTokens.push(
          `Credentials: Serverless Dashboard, "${
            credentials.dashboardProviderAlias
          }" provider (${getDashboardProvidersUrl(serverless.pluginManager.dashboardPlugin)})`
        );
      } else if (credentials.credentials) {
        if (credentials.credentials.profile) {
          detailsTextTokens.push(
            `Credentials: Local, "${credentials.credentials.profile}" profile`
          );
        } else {
          // The only alternative here are credentials from environment variables
          detailsTextTokens.push('Credentials: Local, environment variables');
        }
      }
    }
  }

  detailsTextTokens.push(
    'Docs:        docs.serverless.com',
    'Support:     forum.serverless.com',
    'Bugs:        github.com/serverless/serverless/issues'
  );

  writeText(style.aside(...detailsTextTokens));

  // TODO: Ideally after migrating to new logger complete this strip should not be needed
  //       (it can be removed after we clear all chalk error message decorations from internals)
  const errorMsg =
    exceptionTokens.decoratedMessage ||
    stripAnsi(
      exceptionTokens.stack && !isUserError ? exceptionTokens.stack : exceptionTokens.message
    );
  writeText(null, style.error('Error:'), errorMsg);

  await logDeprecation.printSummary();

  if (!isTelemetryDisabled && hasTelemetryBeenReported === false) {
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
};
