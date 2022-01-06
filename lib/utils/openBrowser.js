'use strict';

/* eslint-disable no-console */

const open = require('open');
const chalk = require('chalk');
const isDockerContainer = require('is-docker');
const { legacy, log, style } = require('@serverless/utils/log');

module.exports = function openBrowser(url) {
  legacy.write(`\nIf your browser does not open automatically, please open the URL: ${url}\n\n`);
  log.notice();
  log.notice(
    style.aside(`If your browser does not open automatically, please open this URL: ${url}`)
  );
  log.notice();
  let browser = process.env.BROWSER;
  if (browser === 'none' || isDockerContainer()) return;
  if (process.platform === 'darwin' && browser === 'open') browser = undefined;
  open(url).then((subprocess) =>
    subprocess.on('error', (err) => {
      if (process.env.SLS_DEBUG) {
        legacy.write(
          `Serverless: ${chalk.red(`Opening of browser window errored with ${err.stack}`)}\n`
        );
      }
      log.info(`Opening of browser window errored with ${err.stack}`);
    })
  );
};
