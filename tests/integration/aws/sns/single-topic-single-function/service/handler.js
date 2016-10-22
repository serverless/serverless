'use strict';

module.exports.hello = (event, context, callback) => {
  process.stdout.write(event.Records[0].EventSource);
  process.stdout.write(event.Records[0].Sns.Message);
  callback(null, { message: 'Hello from SNS!', event });
};
