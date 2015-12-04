/**
 * Serverless Module: Modularized Code
 */

// Export For Lambda Handler
module.exports.run = function(event, context, cb) {
  return cb(null, code());
};

// Code
var code = function() {
  return {
    message: 'Your Serverless lambda executed successfully!'
  };
};
