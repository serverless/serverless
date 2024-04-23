'use strict';

const { awsRequest } = require('../../utils');
const { getEventBusName } = require('./utils');
const {
  LambdaClient,
  AddPermissionCommand,
  RemovePermissionCommand,
} = require('@aws-sdk/client-lambda');

function getStatementId(functionName, ruleName) {
  const normalizedRuleName = ruleName.toLowerCase().replace(/[.:*]/g, '');
  const id = `${functionName}-${normalizedRuleName}`;
  if (id.length < 100) {
    return id;
  }
  return id.substring(0, 100);
}

async function addPermission(config) {
  const { functionName, partition, region, accountId, eventBus, ruleName } = config;
  let SourceArn = `arn:${partition}:events:${region}:${accountId}:rule/${ruleName}`;
  if (eventBus) {
    const eventBusName = getEventBusName(eventBus);
    SourceArn = `arn:${partition}:events:${region}:${accountId}:rule/${eventBusName}/${ruleName}`;
  }
  const addPermissionCommand = new AddPermissionCommand({
    Action: 'lambda:InvokeFunction',
    FunctionName: functionName,
    Principal: 'events.amazonaws.com',
    StatementId: getStatementId(functionName, ruleName),
    SourceArn,
  });
  const lambdaClient = new LambdaClient({ region });
  return await awsRequest(() => lambdaClient.send(addPermissionCommand));
}

async function removePermission(config) {
  const { functionName, region, ruleName } = config;

  const removePermissionCommand = new RemovePermissionCommand({
    FunctionName: functionName,
    StatementId: getStatementId(functionName, ruleName),
  });
  const lambdaClient = new LambdaClient({ region });
  return awsRequest(() => lambdaClient.send(removePermissionCommand));
}

module.exports = {
  getStatementId,
  addPermission,
  removePermission,
};
