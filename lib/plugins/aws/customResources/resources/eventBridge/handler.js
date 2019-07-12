'use strict';

const { addPermission, removePermission } = require('./lib/permissions');
const { updateConfiguration, removeConfiguration } = require('./lib/eventBridge');
const { getRuleName, getEventBusName } = require('./lib/utils');
const { getEnvironment, getLambdaArn, handlerWrapper } = require('../utils');

function handler(event, context) {
  if (event.RequestType === 'Create') {
    return create(event, context);
  } else if (event.RequestType === 'Update') {
    return update(event, context);
  } else if (event.RequestType === 'Delete') {
    return remove(event, context);
  }
  throw new Error(`Unhandled RequestType ${event.RequestType}`);
}

function create(event, context) {
  const { FunctionName, EventBridgeName, EventBridgeConfig } = event.ResourceProperties;
  const { Region, AccountId } = getEnvironment(context);

  const lambdaArn = getLambdaArn(Region, AccountId, FunctionName);
  const ruleName = getRuleName(EventBridgeName);
  const eventBusName = getEventBusName(EventBridgeConfig);

  return addPermission({
    functionName: FunctionName,
    region: Region,
    accountId: AccountId,
    ruleName,
  }).then(() =>
    updateConfiguration({
      eventBusName,
      ruleName,
    })
  );
}

// -- Everything below here is a WIP

function update(event, context) {
  const { Region, AccountId } = getEnvironment(context);
  const { FunctionName, UserPoolName, UserPoolConfig } = event.ResourceProperties;

  const lambdaArn = getLambdaArn(Region, AccountId, FunctionName);

  return updateConfiguration({
    lambdaArn,
    userPoolName: UserPoolName,
    userPoolConfig: UserPoolConfig,
    region: Region,
  });
}

function remove(event, context) {
  const { Region, AccountId } = getEnvironment(context);
  const { FunctionName, UserPoolName } = event.ResourceProperties;

  const lambdaArn = getLambdaArn(Region, AccountId, FunctionName);

  return removePermission({
    functionName: FunctionName,
    userPoolName: UserPoolName,
    region: Region,
  }).then(() =>
    removeConfiguration({
      lambdaArn,
      userPoolName: UserPoolName,
      region: Region,
    })
  );
}

module.exports = {
  // handler: handlerWrapper(handler, 'CustomResouceExistingCognitoUserPool'),
  handler,
};
