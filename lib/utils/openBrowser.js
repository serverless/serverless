'use strict';

/* eslint-disable no-console */

const opn = require('./open');
const chalk = require('chalk');
const isDockerContainer = require('is-docker');

module.exports = function openBrowser(url) {
  process.stdout.write(
    `\nIf your browser does not open automatically, please open the URL: ${url}\n\n`
  );
  let browser = process.env.BROWSER;
  if (browser === 'none' || isDockerContainer()) return;
  if (process.platform === 'darwin' && browser === 'open') browser = undefined;
  const options = { wait: false, app: browser };
  opn(url, options).catch((err) => {
    if (process.env.SLS_DEBUG) {
      process.stdout.write(
        `Serverless: ${chalk.red(`Opening of browser window errored with ${err.stack}`)}\n`
      );
    }
  });
};
