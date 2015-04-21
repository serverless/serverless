/** 
 * AWS Lambda Task
 * - Put tasks in here that take a while to process
 * - Then will be uploaded to AWS Lambda and executed there
 */

module.exports = function(a, b, callback) {

	var answer = a + b;

    return callback(answer);

};