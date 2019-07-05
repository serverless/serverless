'use strict';

const path = require('path');
const chalk = require('chalk');

/* eslint-disable no-console */

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
  const indexRegex = new RegExp(path.join(path.sep, 'index.js'));
  const tabtabPath = require.resolve('tabtab').replace(indexRegex, '');
  const tabtabCliPath = path.join(tabtabPath, 'src', 'cli.js');
  console.log(
    "If you'd like autocomplete for serverless, you can run the following commands to add it:\n"
  );
  console.log(`\tnode "${tabtabCliPath}" install --name serverless --auto`);
  console.log(`\tnode "${tabtabCliPath}" install --name sls --auto`);
  console.log(`\tnode "${tabtabCliPath}" install --name slss --auto`);
  console.log();
}
