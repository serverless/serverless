'use strict';

const chalk = require('chalk');
const log = require('./log');
const os = require('os');

const colorPrefix = chalk.hex('#D86121');
const colorDim = chalk.hex('#777777');
const spaceSmall = '    ';
const spaceLarge = '                    ';
const prefix = colorPrefix(` Event Gateway${spaceSmall}`);

const prettifyValue = value => {
  const prettified = JSON.stringify(value, null, 2).replace(
    new RegExp('\\n', 'g'),
    `${os.EOL}                    `
  );
  return `${spaceLarge}${prettified}`;
};

const getMessage = msg => {
  let parsedMsg;
  try {
    parsedMsg = JSON.parse(msg);
  } catch (err) {
    return false
  }

  if (parsedMsg.msg === 'Function registered.') {
    return `Function registered: ${parsedMsg.functionId}`;
  } else if (parsedMsg.msg === 'Subscription created.') {
    return `Subscription registered: event:${parsedMsg.event} >>> function:${parsedMsg.functionId}`;
  } else if (parsedMsg.msg === 'Subscription deleted.') {
    return `Subscription removed: event:${parsedMsg.event} >>> function:${parsedMsg.functionId}`;
  } else if (parsedMsg.msg === 'Event received.') {
    const event = JSON.parse(parsedMsg.event);
    const text = `Event received: ${event.event}${os.EOL}`;
    const ppData = colorDim(prettifyValue(event));
    return `${text}${ppData}`;
  } else if (parsedMsg.msg === 'Function invoked.') {
    const response = prettifyValue(JSON.parse(parsedMsg.response));
<<<<<<< 59656e1806f0ed26351763e33193273ec3a1f66c
    const responseText = `                ${caret}    response:\n${response}`;
    const text = `Invoked function ${parsedMsg.functionId}\n${responseText}\n`;
=======
    const responseText = `${spaceSmall}response:${os.EOL}${response}`;
    const text = `Invoked function ${parsedMsg.functionId}${os.EOL}${responseText}`;
>>>>>>> add modifications
    return `${text}`;
  } else if (parsedMsg.msg === 'Function invocation failed.') {
    const text = `Failed to invoke function ${parsedMsg.functionId}${os.EOL}`;
    const errorText = `${spaceLarge}error: ${parsedMsg.error}`;
    return `${text}${errorText}`;
  } else if (parsedMsg.msg.startsWith('Running in development mode with embedded etcd')) {
    const partOne = 'Running in development mode with embedded etcd. Event API listening on ';
    const re = new RegExp(`${partOne}(.*). Config API listening on (.*).`);
    const found = parsedMsg.msg.match(re);
    if (found) {
      return `Event API listening on: ${found[1]}${os.EOL}${prefix}Config API listening on: ${found[2]}`;
    }
    throw new Error('Could not parse boot message');
  } else {
    return false;
  }
}

module.exports = msg => {
  console.log(msg)
  const processedMsg = getMessage(msg);
  if (processedMsg) {
    log(`${prefix}${processedMsg}${os.EOL}`);
  }
};
