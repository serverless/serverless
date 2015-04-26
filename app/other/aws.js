/**
 * AWS Services
 * - Config the AWS Client and other Ahere
 * - Require this into your modules instead of configuring the AWS Client everywhere
 */

var AWS = require('aws-sdk');

// Config AWS Client
AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
});

// Export
module.exports.AWS = AWS;
module.exports.dynamoDB = new AWS.DynamoDB();