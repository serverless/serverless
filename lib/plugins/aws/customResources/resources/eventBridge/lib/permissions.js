'use strict';

const AWS = require('aws-sdk');

function getStatementId(functionName, ruleName) {
  const normalizedRuleName = ruleName.toLowerCase().replace(/[.:*]/g, '');
  const id = `${functionName}-${normalizedRuleName}`;
  if (id.length < 100) {
    return id;
  }
  return id.substring(0, 100);
}

function addPermission(config) {
  const { functionName, region, accountId, ruleName } = config;
  const lambda = new AWS.Lambda({ region });
  const partition = region && /^cn-/.test(region) ? 'aws-cn' : 'aws';
  const params = {
    Action: 'lambda:InvokeFunction',
    FunctionName: functionName,
    Principal: 'events.amazonaws.com',
    StatementId: getStatementId(functionName),
    SourceArn: `arn:${partition}:events:${region}:${accountId}:rule/${ruleName}`,
  };
  return lambda.addPermission(params).promise();
}

function removePermission(config) {
  const { functionName, userPoolName, region } = config;
  const lambda = new AWS.Lambda({ region });
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
