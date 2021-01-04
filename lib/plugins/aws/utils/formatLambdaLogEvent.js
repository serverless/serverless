'use strict';

const dayjs = require('dayjs');
const chalk = require('chalk');
const os = require('os');

module.exports = (msgParam) => {
  let msg = msgParam;
  const dateFormat = 'YYYY-MM-DD HH:mm:ss.SSS (Z)';

  if (msg.startsWith('REPORT')) {
    msg += os.EOL;
  }

  if (msg.startsWith('START') || msg.startsWith('END') || msg.startsWith('REPORT')) {
    return chalk.gray(msg);
  } else if (msg.trim() === 'Process exited before completing request') {
    return chalk.red(msg);
  }

  const splitted = msg.split('\t');

  if (splitted.length < 3) {
    return msg;
  }

  let date = '';
  let reqId = '';
  let level = '';
  if (!isNaN(new Date(splitted[0]).getTime())) {
    date = splitted[0];
    reqId = splitted[1];
  } else if (!isNaN(new Date(splitted[1]).getTime())) {
    date = splitted[1];
    reqId = splitted[2];
    level = `${splitted[0]}\t`;
  } else {
    return msg;
  }
  const text = msg.split(`${reqId}\t`)[1];
  const time = chalk.green(dayjs(date).format(dateFormat));

  return `${time}\t${chalk.yellow(reqId)}\t${level}${text}`;
};
