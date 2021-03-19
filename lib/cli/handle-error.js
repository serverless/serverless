'use strict';

const path = require('path');
const isObject = require('type/object/is');
const chalk = require('chalk');
const isStandaloneExecutable = require('../utils/isStandaloneExecutable');
const resolveLocalServerlessPath = require('./resolve-local-serverless-path');
const slsVersion = require('./../../package').version;
const sfeVersion = require('@serverless/enterprise-plugin/package.json').version;
const { platformClientVersion } = require('@serverless/enterprise-plugin');
const ServerlessError = require('../serverless-error');
const tokenizeException = require('../utils/tokenize-exception');

const serverlessPath = path.resolve(__dirname, '../Serverless.js');

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

module.exports = async (exception, options = {}) => {
  if (!isObject(options)) options = {};
  const { isUncaughtException, isLocallyInstalled, isInvokedByGlobalInstallation } = options;

  if (isInvokedByGlobalInstallation) {
    const localServerlessPath = await resolveLocalServerlessPath();

    try {
      // Attempt to use error handler from local version
      // TODO: Remove local version fallback with next major (when its moved to the top of the process)
      try {
        require(path.resolve(localServerlessPath, '../cli/handle-error'))(exception, {
          isLocallyInstalled,
          isUncaughtException,
        });
        return;
      } catch (error) {
        // Pass and attempt to use old-style error handler from local version

        // Ugly mock of serverless below is used to ensure that Framework version will be logged with `(local)` suffix
        require(path.resolve(localServerlessPath, '../classes/Error')).logError(exception, {
          serverless: { isLocallyInstalled },
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
    return serverlessPath === (await resolveLocalServerlessPath()) ? ' (local)' : '';
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

  process.exitCode = 1;
  if (isUncaughtException) process.exit();
};
