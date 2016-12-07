'use strict';

module.exports.hello = (event, context, callback) => {
  callback(null, { message: 'Go Serverless v1.0! Your function executed successfully!', event });
};
