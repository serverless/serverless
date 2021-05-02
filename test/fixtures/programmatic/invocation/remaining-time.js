'use strict';

module.exports.handler = (event, context, callback) => {
  const data = [context.remainingTimeInMillis()];
  setTimeout(() => {
    data.push(context.remainingTimeInMillis());
    setTimeout(() => {
      data.push(context.remainingTimeInMillis());
      callback(null, {
        statusCode: 200,
        body: JSON.stringify({ data }),
      });
    });
  }, 1000);
};
