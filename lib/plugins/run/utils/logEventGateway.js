'use strict';

/* eslint-disable max-len */

const chalk = require('chalk');
const log = require('./log');
const os = require('os');

const colorPrefix = chalk.hex('#D86121');
const colorDim = chalk.hex('#777777');
const spaceSmall = '  ';
const prefix = colorPrefix(` Event Gateway${spaceSmall}`);
const serverlessColorPrefix = chalk.hex('#bdb018');
const serverlessPrefix = serverlessColorPrefix(` Serverless${spaceSmall}`);

const prettifyValue = value => {
  const prettified = JSON.stringify(value, null, 2).replace(
    new RegExp('\\n', 'g'),
    `${os.EOL}${spaceSmall}`
  );
  return `${spaceSmall}${prettified}`;
};

const processMessage = msg => {
  let parsedMsg;
  try {
    parsedMsg = JSON.parse(msg);
  } catch (err) {
    return false;
  }

  if (parsedMsg.msg === 'Function registered.') {
    return `${prefix}Function '${parsedMsg.functionId}' registered`;
  } else if (parsedMsg.msg === 'Subscription created.') {
    return `${prefix}Subscription created for event '${parsedMsg.event}' and function '${parsedMsg.functionId}'`;
  } else if (parsedMsg.msg === 'Subscription deleted.') {
    return `${prefix}Subscription removed: event:${parsedMsg.event} >>> function:${parsedMsg.functionId}`;
  } else if (parsedMsg.msg === 'Event received.') {
    const event = JSON.parse(parsedMsg.event);
    const text = `${prefix}Event '${event.event}' received:${os.EOL}${os.EOL}`;
    return `${text}${colorDim(prettifyValue(event))}${os.EOL}`;
  } else if (parsedMsg.msg === 'Function triggered.') {
    const event = JSON.parse(parsedMsg.event);
    const text = `Function '${parsedMsg.functionId}' triggered by event '${event.event}'${os.EOL}`;
    return `${serverlessPrefix}   ${text}`;
  } else if (parsedMsg.msg.startsWith('Running in development mode with embedded etcd')) {
    const partOne = 'Running in development mode with embedded etcd. Event API listening on ';
    const re = new RegExp(`${partOne}(.*). Config API listening on (.*).`);
    const found = parsedMsg.msg.match(re);
    if (found) {
      const apiText = `Event API listening on: ${found[1]}`;
      return `${prefix}${apiText}${os.EOL}${prefix}Config API listening on: ${found[2]}`;
    }
  } else if (parsedMsg.msg === 'Function finished.') {
    const response = prettifyValue(JSON.parse(parsedMsg.response));
    const text = `Function '${parsedMsg.functionId}' finished:${os.EOL}${os.EOL}${colorDim(response)}${os.EOL}`;
    return `${serverlessPrefix}   ${text}`;
  }

  return false;
};

module.exports = msg => {
  try {
    const processedMsg = processMessage(msg);
    if (processedMsg) {
      log(`${processedMsg}${os.EOL}`);
    }
  } catch (err) {
    // NOTE keep this here - it's a worse UX to skip messages
    // rather than having an unformated message logged
    log(`${prefix}raw output: ${colorDim(msg)}${os.EOL}`);
  }
};
