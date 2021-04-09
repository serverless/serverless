'use strict';

module.exports.handler = (event, context, callback) => {
  const httpData = event.requestContext.http;
  const resolve = () =>
    callback(null, {
      statusCode: 200,
      body: JSON.stringify({
        path: httpData.path,
        method: httpData.method,
      }),
    });
  if (httpData.path === '/bar/timeout') setTimeout(resolve, 2000);
  else resolve();
};
