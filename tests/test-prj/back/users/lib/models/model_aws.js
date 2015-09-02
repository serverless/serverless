/**
 * Model: AWS
 * - Config the AWS Client
 * - Require this into your modules instead of configuring the AWS Client everywhere
 */


// Dependencies
var Config      = require('../config');
var AWS         = require('aws-sdk');
var DynamoDbDOC = require('dynamodb-doc');

// static vars to save memory
var dynamoDbDocClient, dynamoDbClient;
var lambdaClient, sesClient, s3Client;

// Creds read from IAM role or ENV in dev
if (Config.aws.logger) {
    AWS.config.update({logger: Config.aws.logger});
}

AWS.config.apiVersions = {
    dynamodb: '2012-08-10',
    lambda: '2015-03-31',
    ses: '2010-12-01',
    s3: '2006-03-01'
};

/**
 *
 * @returns {*|DynamoDB}
 * @constructor
 */
module.exports.DynamoDBDoc = function () {
    if (!Config.aws.dynamoDbEndpoint) {
        return new DynamoDbDOC.DynamoDB(new AWS.DynamoDB())
    }
    else {
        return new DynamoDbDOC.DynamoDB(new AWS.DynamoDB({endpoint: new AWS.Endpoint(Config.aws.dynamoDbEndpoint)}));
    }
};

/**
 * Get static copy of DynamoDBDoc client
 *
 * @returns {*}
 */
module.exports.getDynamoDBDoc = function () {
    return (dynamoDbDocClient) ? dynamoDbDocClient : this.DynamoDBDoc();
};

/**
 *
 * @returns {exports.DynamoDB}
 * @constructor
 */
module.exports.DynamoDB = function () { //sometimes you don't want overhead of dynamodb-doc
    if (!Config.aws.dynamoDbEndpoint) {
        return new AWS.DynamoDB();
    }
    else {
        return new AWS.DynamoDB({endpoint: new AWS.Endpoint(Config.aws.dynamoDbEndpoint)});
    }
};

/**
 * Get static copy of DynamoDB client
 *
 * @returns {*}
 */
module.exports.getDynamoDB = function () {
    return (dynamoDbClient) ? dynamoDbClient : this.DynamoDB();
};

/**
 * Get static copy of Lambda client
 *
 * @returns {*}
 */
module.exports.getLambda = function () {
    return (lambdaClient) ? lambdaClient : new AWS.Lambda();
};

/**
 * Get static copy of SES client
 *
 * @returns {*}
 */
module.exports.getSes = function () {
    return (sesClient) ? sesClient : new AWS.SES();
};

/**
 * Get static copy of S3 client
 *
 * @returns {*}
 */
module.exports.getS3 = function () {
    return (s3Client) ? s3Client : new AWS.S3();
};
