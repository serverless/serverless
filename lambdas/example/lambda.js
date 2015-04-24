/**
 * Lambda Function Dependencies
 * - Define your lambda funciton dependencies here
 */

var async = require('async');
var moment = require('moment');
var etsyjs = require('etsy-js');
var etsyClient = etsyjs.client({
    key: 'key',
    secret: 'secret',
    callbackURL: 'http://localhost:3000/authorise'
});
var doc = require('dynamodb-doc');
var dynamo = new doc.DynamoDB();



/**
 * Lambda Function
 * - Enter your lambda function here
 * - Type 'npm run' to test the Lambda function in your terminal
 */

module.exports.lambda_function = function(event, context) {

    var result = event.a + event.b;

    return context.done(null, result);

};