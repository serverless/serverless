'use strict';

module.exports.withErrorByDone = (event, context) => {
  context.done(new Error('failed'));
};

module.exports.withMessageByDone = (event, context) => {
  context.done(null, 'Succeed');
};

module.exports.withMessageByLambdaProxy = (event, context) => {
  context.done(null, {
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

  context.done(null, {
    start,
    stop: context.getRemainingTimeInMillis(),
  });
};
