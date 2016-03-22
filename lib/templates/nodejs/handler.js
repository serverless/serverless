'use strict';

module.exports.handler = function(event, context) {
  return context.done(null, {
    message: 'Go Serverless! Your Lambda function executed successfully!'
  });
};
