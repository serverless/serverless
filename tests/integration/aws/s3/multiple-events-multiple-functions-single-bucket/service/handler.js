'use strict';

module.exports.create = (event, context, callback) => {
  process.stdout.write(event.Records[0].eventSource);
  process.stdout.write(event.Records[0].eventName);
  callback(null, { message: 'Hello from S3!', event });
};

module.exports.remove = (event, context, callback) => {
  process.stdout.write(event.Records[0].eventSource);
  process.stdout.write(event.Records[0].eventName);
  callback(null, { message: 'Hello from S3!', event });
};
