'use strict';

module.exports.callback = (evt, ctx, cb) => {
  return cb(null, 'success');
};

module.exports.callbackError = (evt, ctx, cb) => {
  return cb('error', null);
};

module.exports.contextDone = (evt, ctx) => {
  return ctx.done(null, 'success');
};

module.exports.contextSucceed = (evt, ctx) => {
  return ctx.succeed('success');
};

module.exports.contextFail = (evt, ctx) => {
  return ctx.fail('error');
};

module.exports.promise = () => {
  return new Promise((resolve) => {
    resolve('success');
  });
};

module.exports.promiseError = () => {
  return new Promise(() => {
    throw new Error('This is an error');
  });
};

module.exports.async = async () => {
  return new Promise((resolve) => {
    resolve('success');
  });
};

module.exports.asyncError = async () => {
  return new Promise(() => {
    throw new Error('This is an error');
  });
};
