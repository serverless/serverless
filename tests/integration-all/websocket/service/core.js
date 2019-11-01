'use strict';

function minimal(event, context, callback) {
  console.info('Event type', event.requestContext.eventType);
  if (event.body) console.info('Event body', event.body);
  return callback(null, { statusCode: 200 });
}

module.exports = {
  minimal,
};
