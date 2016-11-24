'use strict';

module.exports.hello = (event, context, callback) => {
  process.stdout.write(event.Records[0].eventSource);
  process.stdout.write(event.Records[0].eventName);
  callback(null, { message: 'Hello from S3!', event });
};
