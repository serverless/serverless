/**
 * AWS Module: Action: Modularized Code
 */
var debug = require('debug')('test');

// Export For Lambda Handler
module.exports.run = function(event, context, cb) {
    return action(event).then(function(result) {
        console.log('Success');
        console.log(result);
        cb(null, result);
    }).error(function(error) {
        debug('Failed: %s', JSON.stringify(error));
        cb(error, null);
    });
};
// Your Code
var action = function(event) {
	return new Promise(function(resolve, reject) {
		console.log(event);
  		if (event.succeed) {
  			resolve('Yay!');
  		} else {
  			reject({error: 'Boo!'});
  		}
  	});
};
