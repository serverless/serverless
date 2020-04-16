'use strict';

// NOTE: the `utils.js` file is bundled into the deployment package
// eslint-disable-next-line
const { log } = require('./utils');

function streamKinesis(event, context, callback) {
  const functionName = 'streamKinesis';
  const { Records } = event;
  const messages = Records.map(({ kinesis: { data } }) => Buffer.from(data, 'base64').toString());
  log(functionName, JSON.stringify(messages));
  return callback(null, event);
}

function streamDynamoDb(event, context, callback) {
  const functionName = 'streamDynamoDb';
  log(functionName, JSON.stringify(event));
  return callback(null, event);
}

module.exports = { streamKinesis, streamDynamoDb };
