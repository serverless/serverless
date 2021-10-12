'use strict';

module.exports.handler = (event, context, callback) => {
  const data = [context.getRemainingTimeInMillis()];
  setTimeout(() => {
    data.push(context.getRemainingTimeInMillis());
    setTimeout(() => {
      data.push(context.getRemainingTimeInMillis());
      callback(null, {
        statusCode: 200,
        body: JSON.stringify({ data }),
      });
    });
  }, 100);
};
