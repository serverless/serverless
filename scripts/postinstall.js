'use strict';

const path = require('path');
const chalk = require('chalk');

/* eslint-disable no-console */

const execSync = require('child_process').execSync;

const truthyStr = val => val && !['0', 'false', 'f', 'n', 'no'].includes(val.toLowerCase());
const { CI, ADBLOCK, SILENT } = process.env;
if (!truthyStr(CI) && !truthyStr(ADBLOCK) && !truthyStr(SILENT)) {
  console.log(
    chalk.yellow(`\
 +--------------------------------------------------+
 |                                                  |
 |  Serverless Framework successfully installed!    |
 |  To start your first project, run “serverless”.  |
 |                                                  |
 +--------------------------------------------------+
`)
  );
}

try {
  const Serverless = require('../lib/Serverless');
  const serverless = new Serverless();

  (() =>
    serverless
      .init()
      .then(() => serverless.utils.logStat(serverless, 'install'))
      .catch(() => Promise.resolve()))();
} catch (error) {
  // fail silently
}
