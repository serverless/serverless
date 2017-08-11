const chalk = require('chalk');
const log = require('./log');

const colorText = chalk.hex('#D86121');
const caret = colorText('|');

const ignoredMessage = ['Running in development mode with embedded etcd.'];

const prettifyValue = value =>
  JSON.stringify(value, null, 2).replace(
    new RegExp('\\n', 'g'),
    `\n                ${caret}      `
  );

const transformMessages = parsedMsg => {
  if (parsedMsg.msg === 'Function registered.') {
    return `Registered function ${parsedMsg.functionId}\n`;
  } else if (parsedMsg.msg === 'Subscription created.') {
    return `Subscribed function ${parsedMsg.functionId} to event ${parsedMsg.event}\n`;
  } else if (parsedMsg.msg === 'Event received.') {
    const event = JSON.parse(parsedMsg.event);
    const text = `Received event ${event.event}\n`;
    const dataTypeText = `                ${caret}    dataType: ${event.dataType}\n`;
    const ppData = prettifyValue(event.data);
    const dataText = `                ${caret}    data:\n                ${caret}      ${ppData}`;
    return `${text}${dataTypeText}${dataText}\n`;
  } else if (parsedMsg.msg === 'Function invoked.') {
    const text = `Invoked function ${parsedMsg.functionId}\n`;
    return `${text}`;
  }
  return `${parsedMsg.msg.trim()}\n`;
};

module.exports = msg => {
  const prefix = colorText(' Event Gateway  |  ');
  try {
    const parsedMsg = JSON.parse(msg);
    if (ignoredMessage.includes(parsedMsg.msg)) {
      return;
    }
    log(`${prefix}${transformMessages(parsedMsg)}`);
  } catch (err) {
    log(`${prefix}raw Event Gateway output: ${msg}\n`);
  }
};
