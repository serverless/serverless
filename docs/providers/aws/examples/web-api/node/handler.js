'use strict';

// Your function handler
module.exports.getHelloWorld = function (event, context, callback) {
  const message = {
    message: 'Is it me you`re looking for',
    event,
  };
  // callback will send message object back on Web API request
  callback(null, message);
};
