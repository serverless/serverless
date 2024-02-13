'use strict';

const { MAX_AWS_REQUEST_TRY } = require('../../utils');
const {
  LambdaClient,
  AddPermissionCommand,
  RemovePermissionCommand,
} = require('@aws-sdk/client-lambda');

const lambda = new LambdaClient({ maxAttempts: MAX_AWS_REQUEST_TRY });

function getStatementId(functionName, bucketName) {
  const normalizedBucketName = bucketName.replace(/[.:*]/g, '');
  const id = `${functionName}-${normalizedBucketName}`;
  if (id.length < 100) {
    return id;
  }
  return id.substring(0, 100);
}

async function addPermission(config) {
  const { functionName, bucketName, partition, region, accountId } = config;

  lambda.config.region = () => region;

  const payload = {
    Action: 'lambda:InvokeFunction',
    FunctionName: functionName,
    Principal: 's3.amazonaws.com',
    StatementId: getStatementId(functionName, bucketName),
    SourceArn: `arn:${partition}:s3:::${bucketName}`,
    SourceAccount: accountId,
  };

  return lambda.send(new AddPermissionCommand(payload));
}

async function removePermission(config) {
  const { functionName, bucketName, region } = config;

  lambda.config.region = () => region;

  const payload = {
    FunctionName: functionName,
    StatementId: getStatementId(functionName, bucketName),
  };
  return lambda.send(new RemovePermissionCommand(payload));
}

module.exports = {
  getStatementId,
  addPermission,
  removePermission,
};
