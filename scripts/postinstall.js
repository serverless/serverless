'use strict';

const chalk = require('chalk');

const truthyStr = val => val && !['0', 'false', 'f', 'n', 'no'].includes(val.toLowerCase());
const { CI, ADBLOCK, SILENT } = process.env;
if (!truthyStr(CI) && !truthyStr(ADBLOCK) && !truthyStr(SILENT)) {
  process.stdout.write(
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

  serverless
    .init()
    .then(() => serverless.utils.logStat(serverless, 'install'))
    .catch(() => {});
} catch (error) {
  // Ignore any eventual errors.
  // Package when installed globally may be installed in uncommon user contexts,
  // that may lead to fs access related crashes
  // when e.g. trying to access user's .serverlessrc config
}
