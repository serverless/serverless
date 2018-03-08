/*
 *
 * Implement your function here.
 * The function will get the event as the first parameter with query/body properties:
 * 		var queryparams = event.query;
 *  	var body = event.body;
 *
 * The function should trigger the 'callback' with the following structure:
 *  	callback(null, {
 *			statusCode: 200,
 *			body: '{"hello":"from NodeJS8.3 function"}',
 *			headers: {"Content-Type": "application/json"}
 *		})
 *
*/

module.exports.main = function main (event, context, callback) {
    callback(null, {
		statusCode: 200, 
		body: '{"hello":"from NodeJS8.3 function"}',
		headers: {"Content-Type": "application/json"}
	});
};
