'use strict';

module.exports.withError = () => new Error('failed');

module.exports.withMessage = () => 'Succeed';

module.exports.withErrorByDone = (event, context) => {
  context.done(new Error('failed'));

  // this should not actually trigger a success
  return 'this should not trigger';
};

module.exports.withMessageByDone = (event, context) => {
  context.done(null, 'Succeed');
  return 'this should not trigger';
};

module.exports.withMessageByCallback = (event, context, callback) => {
  callback(null, 'Succeed');

  return;
};

module.exports.withMessageAndDelayByCallback = (event, context, callback) => {
  setTimeout(() => callback(null, 'Succeed'), 1);
};

module.exports.withMessageByLambdaProxy = () => ({
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

  return {
    start,
    stop: context.getRemainingTimeInMillis(),
  };
};
