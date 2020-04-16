'use strict';

exports.main_handler = (event, context, callback) => {
  console.log('%j', event);
  callback(null, 'Hello World');
};
