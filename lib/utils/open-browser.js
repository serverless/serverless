'use strict';

/* eslint-disable no-console */

const open = require('open');
const isDockerContainer = require('is-docker');
const { log, style } = require('@serverless/utils/log');

module.exports = function openBrowser(url) {
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
      log.info(`Opening of browser window errored with ${err.stack}`);
    })
  );
};
