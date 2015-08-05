/**
 * Model: AWS
 * - Config the AWS Client
 * - Require this into your modules instead of configuring the AWS Client everywhere
 */


// Dependencies
var Config = require('../config/config');
var AWS    = require('aws-sdk');

// Creds read from IAM role or
if (Config.aws.logger) {
    AWS.config.update({logger: config.aws.logger});
}

/**
 * Export AWS Services
 */

module.exports.DynamoDB = function () {
    var DOC = require('dynamodb-doc');
    return new DOC.DynamoDB(new AWS.DynamoDB());
};

module.exports.Lambda = new AWS.Lambda();

module.exports.SES = new AWS.SES();