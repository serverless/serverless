'use strict';

const chalk = require('chalk');

const colorText = chalk.hex('#bdb018');

function logLocalEmulator(message) {
  process.stdout.write(`${colorText(' Local Emulator |  ')}${message.trim()}\n`);
}

module.exports = logLocalEmulator;
