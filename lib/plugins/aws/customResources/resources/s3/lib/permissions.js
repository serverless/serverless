'use strict';

const { awsRequest } = require('../../utils');

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
  const payload = {
    Action: 'lambda:InvokeFunction',
    FunctionName: functionName,
    Principal: 's3.amazonaws.com',
    StatementId: getStatementId(functionName, bucketName),
    SourceArn: `arn:${partition}:s3:::${bucketName}`,
    SourceAccount: accountId,
  };
  return awsRequest({ name: 'Lambda', params: { region } }, 'addPermission', payload);
}

async function removePermission(config) {
  const { functionName, bucketName, region } = config;
  const payload = {
    FunctionName: functionName,
    StatementId: getStatementId(functionName, bucketName),
  };
  return awsRequest({ name: 'Lambda', params: { region } }, 'removePermission', payload);
}

module.exports = {
  getStatementId,
  addPermission,
  removePermission,
};
