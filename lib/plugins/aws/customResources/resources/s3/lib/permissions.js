'use strict';

const { awsRequest } = require('../../utils');
const {
  LambdaClient,
  AddPermissionCommand,
  RemovePermissionCommand,
} = require('@aws-sdk/client-lambda');

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
  const addPermissionCommand = new AddPermissionCommand({
    Action: 'lambda:InvokeFunction',
    FunctionName: functionName,
    Principal: 's3.amazonaws.com',
    StatementId: getStatementId(functionName, bucketName),
    SourceArn: `arn:${partition}:s3:::${bucketName}`,
    SourceAccount: accountId,
  });
  const lambdaClient = new LambdaClient({ region });
  return await awsRequest(() => lambdaClient.send(addPermissionCommand));
}

async function removePermission(config) {
  const { functionName, bucketName, region } = config;
  const removePermissionCommand = new RemovePermissionCommand({
    FunctionName: functionName,
    StatementId: getStatementId(functionName, bucketName),
  });
  const lambdaClient = new LambdaClient({ region });
  return awsRequest(() => lambdaClient.send(removePermissionCommand));
}

module.exports = {
  getStatementId,
  addPermission,
  removePermission,
};
