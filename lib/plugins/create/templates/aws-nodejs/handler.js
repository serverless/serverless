'use strict';

// Your first function handler
module.exports.hello = (event, context, callback) => {
  callback(null, { message: 'Go Serverless v1.0! Your function executed successfully!', event });

  // Use this code if you're using the HTTP LAMBDA-PROXY integration
  /*
  const body = {
    message: 'Go Serverless v1.0! Your function executed successfully!',
    input: event,
  };

  const response = {
    statusCode: 200,
    headers: {
      'custom-header': 'Custom header value',
    },
    body: JSON.stringify(body),
  };

  callback(null, response);
  */
};
