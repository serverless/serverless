'use strict';

module.exports.handler = (event, context, callback) => {
  const resolve = () =>
    callback(null, {
      statusCode: 200,
      body: JSON.stringify({
        path: event.path,
        method: event.httpMethod,
        headers: event.headers,
      }),
    });
  if (event.path === '/bar/timeout') setTimeout(resolve, 2000);
  else resolve();
};
