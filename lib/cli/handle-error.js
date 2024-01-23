'use strict';

const isObject = require('type/object/is');
const stripAnsi = require('strip-ansi');
const { style, writeText, log } = require('@serverless/utils/log');
const slsVersion = require('./../../package').version;
const isStandaloneExecutable = require('../utils/is-standalone-executable');
const tokenizeException = require('../utils/tokenize-exception');
const isLocallyInstalled = require('./is-locally-installed');
const resolveErrorLocation = require('../utils/telemetry/resolve-error-location');

const isErrorCodeNormative = RegExp.prototype.test.bind(/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/);

module.exports = async (exception, options = {}) => {
  if (!isObject(options)) options = {};
  const { serverless } = options;

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
    `framework ${slsVersion}${installationModePostfix}${globalInstallationPostfix} `
  ];

  if (serverless && serverless.service.provider.name === 'aws') {
    const credentials = serverless.getProvider('aws').cachedCredentials;
    if (credentials && credentials.credentials) {
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

  detailsTextTokens.push(
    'Docs:        docs.serverless.com',
    'Support:     forum.serverless.com',
    'Bugs:        github.com/serverless/serverless/issues'
  );

  log.notice(style.aside(detailsTextTokens.join('\n')));
  log.notice();

  // TODO: Ideally after migrating to new logger complete this strip should not be needed
  //       (it can be removed after we clear all chalk error message decorations from internals)
  const errorMsg =
    exceptionTokens.decoratedMessage ||
    stripAnsi(
      exceptionTokens.stack && !isUserError ? exceptionTokens.stack : exceptionTokens.message
    );
  writeText(style.error('Error:'), errorMsg);

  process.exitCode = 1;

  const failureReason = { kind: isUserError ? 'user' : 'programmer', code: exception.code };
  if (!isUserError || !exception.code || !isErrorCodeNormative(exception.code)) {
    failureReason.location = resolveErrorLocation(exceptionTokens);
  }

  return { telemetryData: { failureReason, outcome: 'failure' } };
};
