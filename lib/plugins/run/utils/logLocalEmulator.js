'use strict';

const os = require('os');
const chalk = require('chalk');

const colorPrefix = chalk.hex('#bdb018');
const colorDim = chalk.hex('#777777');
const colorError = chalk.hex('#e22836');
const spaceSmall = '     ';
const prefix = colorPrefix(` Serverless${spaceSmall}`);

const processMessage = rawMessage => {
  let msg = rawMessage;
  if (msg.trim().length < 0) {
    return false;
  } else if (typeof msg === 'string') {
    msg = msg.trim();

    if (msg.startsWith('Error:')) {
      msg = `${colorError('Function failed due to an error:')}${os.EOL}${os.EOL}${colorDim(
        msg
      )}${os.EOL}`;
    }
  }

  return msg;
};

function logLocalEmulator(rawMessage) {
  const message = processMessage(rawMessage);
  if (message) {
    process.stdout.write(`${prefix}${message}${os.EOL}`);
  }
}

module.exports = logLocalEmulator;
