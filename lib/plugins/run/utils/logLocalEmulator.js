'use strict';

const chalk = require('chalk');

function logLocalEmulator(message) {
  process.stdout.write(`${chalk.green(' Local Emulator |  ')}${message.trim()}\n`);
}

module.exports = logLocalEmulator;
