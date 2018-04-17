'use strict';

module.exports.withErrorByDone = (event, context) => {
  return Promise.reject(new Error('failed'));
};

module.exports.withMessageByDone = (event, context) => {
  return Promise.resolve('Succeed');
};

module.exports.withMessageByLambdaProxy = (event, context) => {
  return Promise.resolve({
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      result: true,
      message: 'Whatever',
    }),
  });
};

module.exports.withRemainingTime = (event, context) => {
  const start = context.getRemainingTimeInMillis();

  const stopAt = new Date().getTime() + 1;
  while (new Date().getTime() < stopAt);

  return Promise.resolve({
    start,
    stop: context.getRemainingTimeInMillis(),
  });
};
