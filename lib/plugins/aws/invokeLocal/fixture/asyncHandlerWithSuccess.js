'use strict';

module.exports.withErrorByDone = () => Promise.reject(new Error('failed'));

module.exports.withMessageByDone = () => Promise.resolve('Succeed');

module.exports.withMessageByCallback = (event, context, callback) => {
  callback(null, 'Succeed');

  return Promise.resolve();
};

module.exports.withMessageByLambdaProxy = () =>
  Promise.resolve({
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      result: true,
      message: 'Whatever',
    }),
  });

module.exports.withRemainingTime = (event, context) => {
  const start = context.getRemainingTimeInMillis();

  const stopAt = new Date().getTime() + 1;
  while (new Date().getTime() < stopAt);

  return Promise.resolve({
    start,
    stop: context.getRemainingTimeInMillis(),
  });
};
