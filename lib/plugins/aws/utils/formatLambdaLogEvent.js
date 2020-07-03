'use strict';

const dayjs = require('dayjs');
const chalk = require('chalk');
const os = require('os');

const timestampFormat = 'YYYY-MM-DD HH:mm:ss.SSS (Z)';

// isAWSMessage returns true when msg starts with one of the AWS keywords.
const isAWSMessage = msg => {
  const awsPrefixes = ['START', 'END', 'REPORT'];
  return awsPrefixes.some(p => msg.startsWith(p));
};

// isExitedMessage returns true when msg represents a process crash.
const isExitedMessage = msg => {
  return msg.trim() === 'Process exited before completing request';
};

// isValidDate returns true is timestamp a string that can be parsed as a date.
const isValidDate = timestamp => !isNaN(new Date(timestamp).getTime());

// prefixDate takes two strings: msg and timestamp.
// If timestamp is not empty it's parsed as a Date and formatted to a string
// using `timestampFormat`.
const prefixDate = (msg, timestamp) => {
  if (!timestamp || !isValidDate(timestamp)) {
    return msg;
  }
  const timestampStr = dayjs(timestamp).format(timestampFormat);
  return `${chalk.green(timestampStr)}\t${msg}`;
};

// parseFields returns an object extracting some common fields from a log
// message.
//
// It supports different log flavours:
// Python:                   <level>\t<timestamp>\t<reqID>\t<message>
// Node.js:                  <timestamp>\t<reqID>\t<message>
// Go (and probably others): <message>
const parseFields = msg => {
  const splitted = msg.split('\t', 4);

  if (splitted.length === 4 && isValidDate(splitted[1])) {
    // Python flavour
    return {
      level: splitted[0],
      timestamp: splitted[1],
      reqID: splitted[2],
      message: splitted[3],
    };
  }

  if (splitted.length === 3 && isValidDate(splitted[0])) {
    // Node.js flavour
    return {
      timestamp: splitted[0],
      reqID: splitted[1],
      message: splitted[2],
    };
  }

  return { message: msg };
};

// formatLog tries to parse a log message using parseFields, then returns a
// formatted string containing all available informations.
const formatLog = (msg, fallbackTimestamp) => {
  const fields = parseFields(msg);

  const composedMsg = [fields.reqID && chalk.yellow(fields.reqID), fields.level, fields.message]
    .filter(s => s)
    .join('\t');

  return prefixDate(composedMsg, fields.timestamp || fallbackTimestamp);
};

module.exports = (msgParam, timestamp = null) => {
  let msg = msgParam;

  if (msg.startsWith('REPORT')) {
    // add an empty line between different executions
    msg += os.EOL;
  }

  if (isAWSMessage(msg)) {
    return prefixDate(chalk.gray(msg), timestamp);
  }

  if (isExitedMessage(msg)) {
    return prefixDate(chalk.red(msg), timestamp);
  }

  return formatLog(msg, timestamp);
};
