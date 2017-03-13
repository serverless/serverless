'use strict';

module.exports.lambda = (event, context, cb) => {
  cb(null, 'a result');
};

module.exports.lambdaViaSucceed = (event, context, cb) => { // eslint-disable-line no-unused-vars
  context.succeed('a result');
};

module.exports.lambdaViaFail = (event, context, cb) => { // eslint-disable-line no-unused-vars
  context.fail('a result');
};

module.exports.lambdaViaDone = (event, context, cb) => { // eslint-disable-line no-unused-vars
  context.done();
};

module.exports.checkTimeout = (event, context, cb) => { // eslint-disable-line no-unused-vars
  const remainingTime = context.getRemainingTimeInMillis();
  context.succeed(remainingTime);
};
