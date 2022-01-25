'use strict';

const { awsRequest } = require('../../utils');
const { getEventBusName } = require('./utils');

function getStatementId(functionName, ruleName) {
  const normalizedRuleName = ruleName.toLowerCase().replace(/[.:*]/g, '');
  const id = `${functionName}-${normalizedRuleName}`;
  if (id.length < 100) {
    return id;
  }
  return id.substring(0, 100);
}

async function addPermission(config) {
  const { functionName, functionArn, partition, region, accountId, eventBus, ruleName } = config;
  let SourceArn = `arn:${partition}:events:${region}:${accountId}:rule/${ruleName}`;
  if (eventBus) {
    const eventBusName = getEventBusName(eventBus);
    SourceArn = `arn:${partition}:events:${region}:${accountId}:rule/${eventBusName}/${ruleName}`;
  }
  const payload = {
    Action: 'lambda:InvokeFunction',
    FunctionName: functionArn,
    Principal: 'events.amazonaws.com',
    StatementId: getStatementId(functionName, ruleName),
    SourceArn,
  };
  return awsRequest({ name: 'Lambda', params: { region } }, 'addPermission', payload);
}

async function removePermission(config) {
  const { functionName, region, ruleName } = config;
  const payload = {
    FunctionName: functionName,
    StatementId: getStatementId(functionName, ruleName),
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
