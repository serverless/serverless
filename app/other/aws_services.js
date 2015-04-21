/**
 * AWS Services
 * - Config the AWS Client and other Ahere
 * - Require this into your modules instead of configuring the AWS Client everywhere
 */

var AWS = require('aws-sdk');
var lambdaws = require('lambdaws');

// Config AWS Client
AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: "us-east-1"
});

// Config Lambdaws Module
lambdaws.config({
    credentials: {
        accessKey: process.env.AWS_ACCESS_KEY,
        secretKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
    role: process.env.AWS_LAMBDA_ROLE
});

// Export
module.exports.dynamoDB = new AWS.DynamoDB();
module.exports.lambdaws = lambdaws;
