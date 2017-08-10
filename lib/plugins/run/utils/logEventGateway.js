const chalk = require('chalk');
const log = require('./log');

const colorText = chalk.hex('#D86121');
const caret = colorText('|');

const ignoredMessage = [
  'Running in development mode with embedded etcd.',
  'Function registered.',
  'Subscription created.',
];

const prettifyValue = value =>
  JSON.stringify(value, null, 2).replace(
    new RegExp('\\n', 'g'),
    `\n                ${caret}      `
  );

const transformMessages = parsedMsg => {
  if (parsedMsg.msg === 'Function local cache received value update.') {
    return `Registered function ${JSON.parse(parsedMsg.value).functionId}\n`;
  } else if (parsedMsg.msg === 'Subscription local cache received value update.') {
    const data = JSON.parse(parsedMsg.value);
    return `Subscribed function ${data.functionId} to event ${data.event}\n`;
  } else if (parsedMsg.msg === 'Event received.') {
    const event = JSON.parse(parsedMsg.event);
    const text = `Received event ${event.event}\n`;
    const dataTypeText = `                ${caret}    dataType: ${event.dataType}\n`;
    const ppData = prettifyValue(event.data);
    const dataText = `                ${caret}    data:\n                ${caret}      ${ppData}`;
    return `${text}${dataTypeText}${dataText}\n`;
  } else if (parsedMsg.msg === 'Function invoked.') {
    const text = `Invoked function ${parsedMsg.functionId}\n`;
    return `${text}\n`;
  }
  return `${parsedMsg.msg.trim()}\n`;
};

module.exports = msg => {
  const parsedMsg = JSON.parse(msg);
  if (ignoredMessage.includes(parsedMsg.msg)) {
    return;
  }
  const prefix = colorText(' Event Gateway  |  ');
  log(`${prefix}${transformMessages(parsedMsg)}`);
};
