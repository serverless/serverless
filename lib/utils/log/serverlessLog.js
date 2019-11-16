'use strict';

/* eslint-disable no-console */

const chalk = require('chalk');

const log = function(message) {
  console.log(`Serverless: ${chalk.yellow(message)}`);
};

module.exports = log;
