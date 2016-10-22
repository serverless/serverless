'use strict';

module.exports.hello = (event, context, callback) => {
  process.stdout.write(event.source);
  process.stdout.write(event['detail-type']);
  callback(null, { message: 'Hello from Schedule!', event });
};

module.exports.world = (event, context, callback) => {
  process.stdout.write(event.source);
  process.stdout.write(event['detail-type']);
  callback(null, { message: 'Hello from Schedule!', event });
};
