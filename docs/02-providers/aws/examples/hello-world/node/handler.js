'use strict';

// Your function handler
module.exports.helloWorldHandler = function (event, context, callback) {
  const message = {
    message: 'Hello World',
  };

  // callback will send message object back
  callback(null, message);
};
