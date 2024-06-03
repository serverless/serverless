'use strict';

const { MAX_AWS_REQUEST_TRY } = require('../../utils');
const {
  LambdaClient,
  AddPermissionCommand,
  RemovePermissionCommand,
} = require('@aws-sdk/client-lambda');

const lambda = new LambdaClient({ maxAttempts: MAX_AWS_REQUEST_TRY });

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
  lambda.config.region = () => region;

  const payload = {
    Action: 'lambda:InvokeFunction',
    FunctionName: functionName,
    Principal: 'cognito-idp.amazonaws.com',
    StatementId: getStatementId(functionName, userPoolName),
    SourceArn: `arn:${partition}:cognito-idp:${region}:${accountId}:userpool/${userPoolId}`,
  };
  return lambda.send(new AddPermissionCommand(payload));
}

async function removePermission(config) {
  const { functionName, userPoolName, region } = config;
  lambda.config.region = () => region;
  const payload = {
    FunctionName: functionName,
    StatementId: getStatementId(functionName, userPoolName),
  };
  return lambda.send(new RemovePermissionCommand(payload));
}

module.exports = {
  getStatementId,
  addPermission,
  removePermission,
};
