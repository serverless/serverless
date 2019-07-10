'use strict';

const AWS = require('aws-sdk');

function getStatementId(functionName, bucketName) {
  const normalizedBucketName = bucketName.replace(/[.:*]/g, '');
  const id = `${functionName}-${normalizedBucketName}`;
  if (id.length < 100) {
    return id;
  }
  return id.substring(0, 100);
}

function addPermission(config) {
  const { functionName, bucketName, region } = config;
  const lambda = new AWS.Lambda({ region });
  const partition = region && /^cn-/.test(region) ? 'aws-cn' : 'aws';
  const payload = {
    Action: 'lambda:InvokeFunction',
    FunctionName: functionName,
    Principal: 's3.amazonaws.com',
    StatementId: getStatementId(functionName, bucketName),
    SourceArn: `arn:${partition}:s3:::${bucketName}`,
  };
  return lambda.addPermission(payload).promise();
}

function removePermission(config) {
  const { functionName, bucketName, region } = config;
  const lambda = new AWS.Lambda({ region });
  const payload = {
    FunctionName: functionName,
    StatementId: getStatementId(functionName, bucketName),
  };
  return lambda.removePermission(payload).promise();
}

module.exports = {
  getStatementId,
  addPermission,
  removePermission,
};
