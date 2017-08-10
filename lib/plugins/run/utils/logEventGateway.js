const chalk = require('chalk');
const log = require('./log');

const ignoredMessage = [
  'Running in development mode with embedded etcd.',
  'Function registered.',
  'Subscription created.',
];

const prettifyValue = value =>
  JSON.stringify(value, null, 2).replace(new RegExp('\\n', 'g'), '\n                |      ');

const transformMessages = parsedMsg => {
  if (parsedMsg.msg === 'Function local cache received value update.') {
    return chalk.blue(
      ` Event Gateway  |  Registered function ${JSON.parse(parsedMsg.value).functionId}\n`
    );
  } else if (parsedMsg.msg === 'Subscription local cache received value update.') {
    const data = JSON.parse(parsedMsg.value);
    return chalk.blue(
      ` Event Gateway  |  Subscribed function ${data.functionId} to event ${data.event}\n`
    );
  } else if (parsedMsg.msg === 'Event received.') {
    const event = JSON.parse(parsedMsg.event);
    const text = ` Event Gateway  |  Received event ${event.event}\n`;
    const dataTypeText = `                |    dataType: ${event.dataType}\n`;
    const dataText = `                |    data:\n                |      ${prettifyValue(
      event.data
    )}`;
    return chalk.blue(`${text}${dataTypeText}${dataText}\n`);
  } else if (parsedMsg.msg === 'Function invoked.') {
    const text = ` Event Gateway  |  Invoked function ${parsedMsg.functionId}\n`;
    return chalk.blue(`${text}\n`);
  }
  return chalk.blue(` Event Gateway  |  ${parsedMsg.msg.trim()}\n`);
};

module.exports = msg => {
  const parsedMsg = JSON.parse(msg);
  if (ignoredMessage.includes(parsedMsg.msg)) {
    return;
  }
  log(transformMessages(parsedMsg));
};
