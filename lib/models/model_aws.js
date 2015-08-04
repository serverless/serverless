/**
 * Model: AWS
 * - Config the AWS Client
 * - Require this into your modules instead of configuring the AWS Client everywhere
 */


// Dependencies
var Config = require('../config/config');
var AWS = require('aws-sdk');


// Config AWS Client
AWS.config.update({
    accessKeyId: Config.aws.admin_access_key,
    secretAccessKey: Config.aws.admin_secret_access_key,
    region: Config.aws.aws_region
});


/**
 * Export AWS Services
 */

module.exports.DynamoDB = function() {
    var DOC = require('dynamodb-doc');
    return new DOC.DynamoDB(new AWS.DynamoDB());
};

module.exports.Lambda = new AWS.Lambda();

module.exports.SES = new AWS.SES();