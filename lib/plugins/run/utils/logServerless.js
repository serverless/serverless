'use strict';

const chalk = require('chalk');

const colorPrefix = chalk.hex('#bdb018');
const spaceSmall = '     ';
const prefix = colorPrefix(` Serverless${spaceSmall}`);

function logServerless(message) {
  process.stdout.write(`${prefix}${message}\n`);
}

module.exports = logServerless;
