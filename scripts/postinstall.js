'use strict';

const boxen = require('boxen');
const chalk = require('chalk');
const isStandaloneExecutable = require('../lib/utils/isStandaloneExecutable');

const isWindows = process.platform === 'win32';

const truthyStr = (val) => val && !['0', 'false', 'f', 'n', 'no'].includes(val.toLowerCase());
const { CI, ADBLOCK, SILENT } = process.env;
const isNpmGlobalPackage = require('../lib/utils/npmPackage/isGlobal');

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

  const message = messageTokens.join('\n\n');
  process.stdout.write(
    `${
      isStandaloneExecutable && isWindows
        ? message
        : boxen(chalk.yellow(message), {
            padding: 1,
            margin: 1,
            borderColor: 'yellow',
          })
    }\n`
  );
}
