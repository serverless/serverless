'use strict';

module.exports.hello = (event, context, callback) => {
  callback(null, { message: 'Hello from API Gateway!', event });
};
