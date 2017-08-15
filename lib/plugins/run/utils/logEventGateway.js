'use strict';

const chalk = require('chalk');
const log = require('./log');
const os = require('os');

const colorPrefix = chalk.hex('#D86121');
const colorDim = chalk.hex('#777777');
const spaceSmall = '  ';
const prefix = colorPrefix(` Event Gateway${spaceSmall}`);

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
    return `Function registered: ${parsedMsg.functionId}`;
  } else if (parsedMsg.msg === 'Subscription created.') {
    return `Subscription registered: event:${parsedMsg.event} >>> function:${parsedMsg.functionId}`;
  } else if (parsedMsg.msg === 'Subscription deleted.') {
    return `Subscription removed: event:${parsedMsg.event} >>> function:${parsedMsg.functionId}`;
  } else if (parsedMsg.msg === 'Event received.') {
    const event = JSON.parse(parsedMsg.event);
    const text = `Event received: ${event.event}${os.EOL}${os.EOL}`;
    return `${text}${colorDim(prettifyValue(event))}${os.EOL}`;
  } else if (parsedMsg.msg === 'Function triggered.') {
    const event = JSON.parse(parsedMsg.event);
    const text = `Function triggered: ${parsedMsg.functionId} by event ${event.event}${os.EOL}`;
    return `${text}`;
  } else if (parsedMsg.msg === 'Function finished.') {
    const response = prettifyValue(JSON.parse(parsedMsg.response));
    const text = `Function finished: ${parsedMsg.functionId}${os.EOL}${os.EOL}${colorDim(response)}${os.EOL}`;
    return `${text}`;
  } else if (parsedMsg.msg === 'Function not found for HTTP event.') {
    return false;
  } else if (parsedMsg.msg === 'Function invocation failed.') {
    return false;
  } else if (parsedMsg.msg.startsWith('Running in development mode with embedded etcd')) {
    const partOne = 'Running in development mode with embedded etcd. Event API listening on ';
    const re = new RegExp(`${partOne}(.*). Config API listening on (.*).`);
    const found = parsedMsg.msg.match(re);
    if (found) {
      const apiText = `Event API listening on: ${found[1]}${os.EOL}`;
      return `${apiText}${prefix}Config API listening on: ${found[2]}`;
    }
    throw new Error('Could not parse boot message');
  } else {
    throw new Error('Could not parse message');
  }
};

module.exports = msg => {
  try {
    const processedMsg = processMessage(msg);
    if (processedMsg) {
      log(`${prefix}${processedMsg}${os.EOL}`);
    }
  } catch (err) {
    // NOTE keep this here - it's a worse UX to skip messages
    // rather than having an unformated message logged
    log(`${prefix}raw output: ${colorDim(msg)}${os.EOL}`);
  }
};
