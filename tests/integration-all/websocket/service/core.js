'use strict';

function minimal(event, context, callback) {
  console.info('Event type', event.requestContext.eventType);
  if (event.body) console.info('Event body', event.body);
  return callback(null, { statusCode: 200 });
}

function sayHello(event, context, callback) {
  const body = JSON.parse(event.body);
  return callback(null, { statusCode: 200, body: `Hello, ${body.name}` });
}

module.exports = {
  minimal,
  sayHello,
};
