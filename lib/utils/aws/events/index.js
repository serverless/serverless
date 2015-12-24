
/**
 * AWS Lambda Events
 */

let dynamoDb   = require('./EventsDynamoDb');

module.exports = {
  dynamodb_stream: dynamoDb.stream
};