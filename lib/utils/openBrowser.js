'use strict';

/* eslint-disable no-console */

const opn = require('opn');
const chalk = require('chalk');
const isDockerContainer = require('is-docker');

function displayManualOpenMessage(url) {
  // https://github.com/sindresorhus/log-symbols
  console.log('---------------------------');
  console.log(`🙈  ${chalk.red('Unable to open browser automatically')}`);
  console.log(chalk.green('Please open your browser & open the URL below to login:'));
  console.log(chalk.yellow(url));
  console.log('---------------------------');
  return false;
}

module.exports = function openBrowser(url) {
  let browser = process.env.BROWSER;
  if (browser === 'none' || isDockerContainer()) {
    return displayManualOpenMessage(url);
  }
  if (process.platform === 'darwin' && browser === 'open') {
    browser = undefined;
  }
  try {
    const options = { app: browser };
    opn(url, options).catch(() => {});
    return true;
  } catch (err) {
    return displayManualOpenMessage(url);
  }
};
