'use strict';

exports.handler = async function (event, context, callback) {
  const response = {
    statusCode: 200,
    body: JSON.stringify({
      version: event.version,
    }),
  };

  callback(null, response);
};
