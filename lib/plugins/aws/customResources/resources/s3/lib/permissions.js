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
  const { functionName, functionArn, bucketName, partition, region, accountId } = config;
  const payload = {
    Action: 'lambda:InvokeFunction',
    FunctionName: functionArn,
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

async function updatePermission(config) {
  try {
    await removePermission(config);
  } catch (err) {
    // If this is just a "ResourceNotFoundException" this can be ignored, as the goal
    // "no permission set" is achieved. Other errors need to be thrown for further investigation.
    if (err.code !== 'ResourceNotFoundException') {
      throw err;
    }
  }
  await addPermission(config);
}

module.exports = {
  getStatementId,
  addPermission,
  removePermission,
  updatePermission,
};
