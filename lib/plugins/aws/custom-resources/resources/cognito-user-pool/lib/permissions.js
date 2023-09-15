'use strict';

const { awsRequest } = require('../../utils');
const {
  LambdaClient,
  AddPermissionCommand,
  RemovePermissionCommand,
} = require('@aws-sdk/client-lambda');

function getStatementId(functionName, userPoolName) {
  const normalizedUserPoolName = userPoolName.toLowerCase().replace(/[.:*\s]/g, '');
  const id = `${functionName}-${normalizedUserPoolName}`;
  if (id.length < 100) {
    return id;
  }
  return id.substring(0, 100);
}

async function addPermission(config) {
  const { functionName, userPoolName, partition, region, accountId, userPoolId } = config;
  const addPermissionCommand = new AddPermissionCommand({
    Action: 'lambda:InvokeFunction',
    FunctionName: functionName,
    Principal: 'cognito-idp.amazonaws.com',
    StatementId: getStatementId(functionName, userPoolName),
    SourceArn: `arn:${partition}:cognito-idp:${region}:${accountId}:userpool/${userPoolId}`,
  });
  const lambdaClient = new LambdaClient({ region });
  return await awsRequest(() => lambdaClient.send(addPermissionCommand));
}

async function removePermission(config) {
  const { functionName, userPoolName, region } = config;
  const removePermissionCommand = new RemovePermissionCommand({
    FunctionName: functionName,
    StatementId: getStatementId(functionName, userPoolName),
  });
  const lambdaClient = new LambdaClient({ region });
  return awsRequest(() => lambdaClient.send(removePermissionCommand));
}

module.exports = {
  getStatementId,
  addPermission,
  removePermission,
};
