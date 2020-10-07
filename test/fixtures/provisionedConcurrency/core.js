'use strict';

function handler(event, context, callback) {
  const functionName = 'provisionedFunc';
  const { Records } = event;
  const messages = Records.map(record => {
    if (record.eventSource === 'aws:sqs') {
      return record.body;
    } else if (record.eventSource === 'aws:kinesis') {
      return Buffer.from(record.kinesis.data, 'base64').toString();
    }
    return '';
  });
  // eslint-disable-next-line no-console
  console.log(functionName, JSON.stringify(messages));
  return callback(null, event);
}

module.exports = { handler };
