/**
 * AWS Module: Action: Modularized Code with Promise for Asynchronous functions
 */
 
var Promise = require('bluebird');

// Export For Lambda Handler
module.exports.run = function(event, context, cb) {
    return action(event).then(function(result) {
        cb(null, result);
    }, function(error) {
        cb(error, null);
    });
};
// Your Code
var action = function(event) {
  return new Promise(function(resolve, reject) {
  // Do your thing here
  var asynchronousFunction = event;
  // Inside your asychronous callback put this:
    if (asynchronousFunction.succeed) {
        resolve('Yay!');
      } else {
        reject({error: 'Boo!'});
      }
    });
};
