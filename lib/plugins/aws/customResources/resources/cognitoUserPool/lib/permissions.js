'use strict';

const { awsRequest } = require('../../utils');

function getStatementId(functionName, userPoolName) {
  const normalizedUserPoolName = userPoolName.toLowerCase().replace(/[.:*\s]/g, '');
  const id = `${functionName}-${normalizedUserPoolName}`;
  if (id.length < 100) {
    return id;
  }
  return id.substring(0, 100);
}

async function addPermission(config) {
  const { functionName, functionArn, userPoolName, partition, region, accountId, userPoolId } =
    config;
  const payload = {
    Action: 'lambda:InvokeFunction',
    FunctionName: functionArn,
    Principal: 'cognito-idp.amazonaws.com',
    StatementId: getStatementId(functionName, userPoolName),
    SourceArn: `arn:${partition}:cognito-idp:${region}:${accountId}:userpool/${userPoolId}`,
  };
  return awsRequest({ name: 'Lambda', params: { region } }, 'addPermission', payload);
}

async function removePermission(config) {
  const { functionName, userPoolName, region } = config;
  const payload = {
    FunctionName: functionName,
    StatementId: getStatementId(functionName, userPoolName),
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
