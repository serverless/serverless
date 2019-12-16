'use strict';

const AWS = require('aws-sdk');
const { getEventBusName } = require('./utils');

function getStatementId(functionName, ruleName) {
  const normalizedRuleName = ruleName.toLowerCase().replace(/[.:*]/g, '');
  const id = `${functionName}-${normalizedRuleName}`;
  if (id.length < 100) {
    return id;
  }
  return id.substring(0, 100);
}

function addPermission(config) {
  const { functionName, partition, region, accountId, eventBus, ruleName } = config;
  const lambda = new AWS.Lambda({ region });
  let SourceArn = `arn:${partition}:events:${region}:${accountId}:rule/${ruleName}`;
  if (eventBus) {
    const eventBusName = getEventBusName(eventBus);
    SourceArn = `arn:${partition}:events:${region}:${accountId}:rule/${eventBusName}/${ruleName}`;
  }
  const params = {
    Action: 'lambda:InvokeFunction',
    FunctionName: functionName,
    Principal: 'events.amazonaws.com',
    StatementId: getStatementId(functionName, ruleName),
    SourceArn,
  };
  return lambda.addPermission(params).promise();
}

function removePermission(config) {
  const { functionName, region, ruleName } = config;
  const lambda = new AWS.Lambda({ region });
  const params = {
    FunctionName: functionName,
    StatementId: getStatementId(functionName, ruleName),
  };
  return lambda.removePermission(params).promise();
}

module.exports = {
  getStatementId,
  addPermission,
  removePermission,
};
