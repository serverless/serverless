'use strict';

const chalk = require('chalk');

const colorPrefix = chalk.hex('#bdb018');
const spaceSmall = '   ';
const prefix = colorPrefix(` Local Emulator${spaceSmall}`);

function logLocalEmulator(message) {
  process.stdout.write(`${prefix}${message.trim()}\n`);
}

module.exports = logLocalEmulator;
