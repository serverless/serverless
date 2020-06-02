'use strict';

module.exports.handler = (event, context, callback) => {
  callback(null, {
    statusCode: 200,
    body: JSON.stringify({ message: 'cloudfront event', input: event }, null, 2),
  });
};
