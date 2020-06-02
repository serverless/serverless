'use strict';

module.exports.handler = (event, context, callback) =>
  callback(null, {
    statusCode: 200,
    body: JSON.stringify({}),
  });
