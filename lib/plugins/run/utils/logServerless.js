'use strict';

const chalk = require('chalk');

function logServerless(message) {
  process.stdout.write(`${chalk.yellow(' Serverless     |  ')}${message}\n`);
}

module.exports = logServerless;
