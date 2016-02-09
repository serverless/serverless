'use strict';

/**
 * AWS Lambda Events
 */

let dynamoDb = require('./EventsDynamoDb'),
    s3       = require('./EventsS3');

module.exports = {
  dynamodb_stream: dynamoDb.stream,
  s3: s3.notification
};