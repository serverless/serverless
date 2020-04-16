'use strict';

const { addPermission, removePermission } = require('./lib/permissions');
const {
  createEventBus,
  deleteEventBus,
  updateRuleConfiguration,
  updateTargetConfiguration,
  removeRuleConfiguration,
  removeTargetConfiguration,
} = require('./lib/eventBridge');
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
  const { FunctionName, EventBridgeConfig } = event.ResourceProperties;
  const { Partition, Region, AccountId } = getEnvironment(context);

  const lambdaArn = getLambdaArn(Partition, Region, AccountId, FunctionName);

  return addPermission({
    functionName: FunctionName,
    partition: Partition,
    region: Region,
    accountId: AccountId,
    eventBus: EventBridgeConfig.EventBus,
    ruleName: EventBridgeConfig.RuleName,
  })
    .then(() =>
      createEventBus({
        region: Region,
        eventBus: EventBridgeConfig.EventBus,
      })
    )
    .then(() =>
      updateRuleConfiguration({
        region: Region,
        ruleName: EventBridgeConfig.RuleName,
        eventBus: EventBridgeConfig.EventBus,
        pattern: EventBridgeConfig.Pattern,
        schedule: EventBridgeConfig.Schedule,
      })
    )
    .then(() =>
      updateTargetConfiguration({
        lambdaArn,
        region: Region,
        ruleName: EventBridgeConfig.RuleName,
        eventBus: EventBridgeConfig.EventBus,
        input: EventBridgeConfig.Input,
        inputPath: EventBridgeConfig.InputPath,
        inputTransformer: EventBridgeConfig.InputTransformer,
      })
    );
}

function update(event, context) {
  const { Partition, Region, AccountId } = getEnvironment(context);
  const { FunctionName, EventBridgeConfig } = event.ResourceProperties;

  const lambdaArn = getLambdaArn(Partition, Region, AccountId, FunctionName);

  return updateRuleConfiguration({
    region: Region,
    ruleName: EventBridgeConfig.RuleName,
    eventBus: EventBridgeConfig.EventBus,
    pattern: EventBridgeConfig.Pattern,
    schedule: EventBridgeConfig.Schedule,
  }).then(() =>
    updateTargetConfiguration({
      lambdaArn,
      region: Region,
      functionName: FunctionName,
      ruleName: EventBridgeConfig.RuleName,
      eventBus: EventBridgeConfig.EventBus,
      input: EventBridgeConfig.Input,
      inputPath: EventBridgeConfig.InputPath,
      inputTransformer: EventBridgeConfig.InputTransformer,
    })
  );
}

function remove(event, context) {
  const { Region } = getEnvironment(context);
  const { FunctionName, EventBridgeConfig } = event.ResourceProperties;

  return removePermission({
    functionName: FunctionName,
    region: Region,
    ruleName: EventBridgeConfig.RuleName,
  })
    .then(() =>
      removeTargetConfiguration({
        ruleName: EventBridgeConfig.RuleName,
        eventBus: EventBridgeConfig.EventBus,
        region: Region,
      })
    )
    .then(() =>
      removeRuleConfiguration({
        ruleName: EventBridgeConfig.RuleName,
        eventBus: EventBridgeConfig.EventBus,
        region: Region,
      })
    )
    .then(() =>
      deleteEventBus({
        eventBus: EventBridgeConfig.EventBus,
        region: Region,
      })
    );
}

module.exports = {
  handler: handlerWrapper(handler, 'CustomResourceEventBridge'),
};
