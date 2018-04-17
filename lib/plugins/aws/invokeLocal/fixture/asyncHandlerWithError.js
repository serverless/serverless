'use strict';

module.exports.withError = (event, context, callback) => {
  return Promise.reject(new Error('failed'));
};

module.exports.withMessage = (event, context, callback) => {
  return Promise.reject('failed');
};
