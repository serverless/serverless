/**
 * AWS Module: Action: Modularized Code
 */

// Export For Lambda Handler
module.exports.run = function(event, context, cb) {
  return cb(null, action());
};

// Your Code
var action = function() {
  return 'You\'re JAWS lambda function has executed successfully!';
};