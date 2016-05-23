'use strict';

module.exports.hello = (event, context, cb) => cb(null,
  { message: 'Go Serverless! Your function executed successfully!' }
);
