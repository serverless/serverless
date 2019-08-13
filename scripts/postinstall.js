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
      .then(() => setupAutocomplete())
      .catch(() => Promise.resolve()))();
} catch (error) {
  // fail silently
}

function setupAutocomplete() {
  return new Promise((resolve, reject) => {
    const indexRegex = new RegExp(path.join(path.sep, 'index.js'));
    const tabtabPath = require.resolve('tabtab').replace(indexRegex, '');
    const tabtabCliPath = path.join(tabtabPath, 'src', 'cli.js');

    try {
      execSync(`node "${tabtabCliPath}" install --name serverless --auto`);
      execSync(`node "${tabtabCliPath}" install --name sls --auto`);
      execSync(`node "${tabtabCliPath}" install --name slss --auto`);
      return resolve();
    } catch (error) {
      execSync(`node "${tabtabCliPath}" install --name serverless --stdout`);
      execSync(`node "${tabtabCliPath}" install --name sls --stdout`);
      execSync(`node "${tabtabCliPath}" install --name slss --stdout`);
      console.log('Could not auto-install serverless autocomplete script.');
      console.log('Please copy / paste the script above into your shell.');
      return reject(error);
    }
  });
}
