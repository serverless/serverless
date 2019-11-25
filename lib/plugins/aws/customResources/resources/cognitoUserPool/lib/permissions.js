'use strict';

const Lambda = require('aws-sdk/clients/lambda');

function getStatementId(functionName, userPoolName) {
  const normalizedUserPoolName = userPoolName.toLowerCase().replace(/[.:*\s]/g, '');
  const id = `${functionName}-${normalizedUserPoolName}`;
  if (id.length < 100) {
    return id;
  }
  return id.substring(0, 100);
}

function addPermission(config) {
  const { functionName, userPoolName, partition, region, accountId, userPoolId } = config;
  const lambda = new Lambda({ region });
  const params = {
    Action: 'lambda:InvokeFunction',
    FunctionName: functionName,
    Principal: 'cognito-idp.amazonaws.com',
    StatementId: getStatementId(functionName, userPoolName),
    SourceArn: `arn:${partition}:cognito-idp:${region}:${accountId}:userpool/${userPoolId}`,
  };
  return lambda.addPermission(params).promise();
}

function removePermission(config) {
  const { functionName, userPoolName, region } = config;
  const lambda = new Lambda({ region });
  const params = {
    FunctionName: functionName,
    StatementId: getStatementId(functionName, userPoolName),
  };
  return lambda.removePermission(params).promise();
}

module.exports = {
  getStatementId,
  addPermission,
  removePermission,
};
