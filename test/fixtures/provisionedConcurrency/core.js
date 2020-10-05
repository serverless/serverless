'use strict';

function sqsHandler(event, context, callback) {
  const functionName = 'provisionedSqs';
  // eslint-disable-next-line no-console
  console.log(functionName, JSON.stringify(event));
  return callback(null, event);
}

function kinesisHandler(event, context, callback) {
  const functionName = 'provisionedKinesis';
  const { Records } = event;
  const messages = Records.map(({ kinesis: { data } }) => Buffer.from(data, 'base64').toString());
  // eslint-disable-next-line no-console
  console.log(functionName, JSON.stringify(messages));
  return callback(null, event);
}

module.exports = { sqsHandler, kinesisHandler };
