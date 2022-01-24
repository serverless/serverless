'use strict';

module.exports.handler = (event, context, callback) => {
  const httpData = event.requestContext.http;
  callback(null, {
    statusCode: 200,
    body: JSON.stringify({
      path: httpData.path,
      method: httpData.method,
    }),
  });
};
