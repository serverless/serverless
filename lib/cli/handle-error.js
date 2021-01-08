'use strict';

const path = require('path');
const { inspect } = require('util');
const isError = require('type/error/is');
const isObject = require('type/object/is');
const chalk = require('chalk');
const isStandaloneExecutable = require('../utils/isStandaloneExecutable');
const resolveLocalServerlessPath = require('./resolve-local-serverless-path');
const slsVersion = require('./../../package').version;
const sfeVersion = require('@serverless/enterprise-plugin/package.json').version;
const { sdkVersion } = require('@serverless/enterprise-plugin');

const userErrorNames = new Set(['ServerlessError', 'YAMLException']);
const serverlessPath = path.resolve(__dirname, '../Serverless.js');

const resolveExceptionMeta = (exception) => {
  if (isError(exception)) {
    return {
      name: exception.name,
      title: exception.name.replace(/([A-Z])/g, ' $1'),
      stack: exception.stack,
      message: exception.message,
    };
  }
  return {
    title: 'Exception',
    message: inspect(exception),
  };
};

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
  const { isUncaughtException, isLocallyInstalled } = options;
  const exceptionMeta = resolveExceptionMeta(exception);
  const isUserError = !isUncaughtException && userErrorNames.has(exceptionMeta.name);

  writeMessage(
    exceptionMeta.title,
    exceptionMeta.stack && (!isUserError || process.env.SLS_DEBUG)
      ? exceptionMeta.stack
      : exceptionMeta.message
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
  consoleLog(chalk.yellow(`     SDK Version:               ${sdkVersion}`));

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
