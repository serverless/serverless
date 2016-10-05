'use strict';

// Your first function handler
module.exports.hello = (event, context, callback) => {
  // This code is used so that your function can repond to HTTP events
  // which use the LAMBDA-PROXY integration
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

  // Use the following code if you're not using the LAMBDA-PROXY integration
  // callback(null, { message: 'Go Serverless v1.0! Your function executed successfully!', event });
};
