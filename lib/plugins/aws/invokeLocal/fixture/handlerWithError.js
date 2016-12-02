'use strict';

module.exports.withError = (event, context, callback) => {
  callback(new Error('failed'));
};

module.exports.withMessage = (event, context, callback) => {
  callback('failed');
};
