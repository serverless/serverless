/**
 * Model: AWS
 * - Config the AWS Client
 * - Require this into your modules instead of configuring the AWS Client everywhere
 */


// Dependencies
var Config      = require('../config');
var AWS         = require('aws-sdk');
var DynamoDbDOC = require('dynamodb-doc');

// Creds read from IAM role or ENV in dev
if (Config.aws.logger) {
    AWS.config.update({logger: Config.aws.logger});
}

AWS.config.apiVersions = {
    dynamodb: '2012-08-10',
    lambda: '2015-03-31',
    ses: '2010-12-01'
};

/**
 * Export AWS Services
 */
module.exports.DynamoDBDoc = function () {
    if (!Config.aws.dynamoDbEndpoint) {
        return new DynamoDbDOC.DynamoDB(new AWS.DynamoDB())
    }
    else {
        return new DynamoDbDOC.DynamoDB(new AWS.DynamoDB({endpoint: new AWS.Endpoint(Config.aws.dynamoDbEndpoint)}));
    }
};

module.exports.DynamoDB = function () { //sometimes you don't want overhead of dynamodb-doc
    if (!Config.aws.dynamoDbEndpoint) {
        return new AWS.DynamoDB();
    }
    else {
        return new AWS.DynamoDB({endpoint: new AWS.Endpoint(Config.aws.dynamoDbEndpoint)});
    }
};

module.exports.Lambda = new AWS.Lambda();

module.exports.SES = new AWS.SES();