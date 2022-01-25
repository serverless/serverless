'use strict';

const chalk = require('chalk');
const isStandaloneExecutable = require('../lib/utils/is-standalone-executable');

const isWindows = process.platform === 'win32';

const truthyStr = (val) => val && !['0', 'false', 'f', 'n', 'no'].includes(val.toLowerCase());
const { CI, ADBLOCK, SILENT } = process.env;
const isNpmGlobalPackage = require('../lib/utils/npm-package/is-global');

if (!truthyStr(CI) && !truthyStr(ADBLOCK) && !truthyStr(SILENT)) {
  const messageTokens = ['Serverless Framework successfully installed!'];

  if (isStandaloneExecutable && !isWindows) {
    messageTokens.push(
      'To start your first project, please open another terminal and run “serverless”.'
    );
  } else {
    messageTokens.push('To start your first project run “serverless”.');
  }

  if ((isStandaloneExecutable && !isWindows) || isNpmGlobalPackage()) {
    messageTokens.push('Turn on automatic updates by running “serverless config --autoupdate”.');
  }

  if (isStandaloneExecutable && !isWindows) {
    messageTokens.push('Uninstall at any time by running “serverless uninstall”.');
  }

  process.stdout.write(`${chalk.grey(messageTokens.join('\n\n'))}\n`);
}
