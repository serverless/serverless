'use strict';

const { MAX_AWS_REQUEST_TRY } = require('../../utils');
const { getEventBusName, getEventBusTargetId } = require('./utils');
const {
  EventBridgeClient,
  CreateEventBusCommand,
  DeleteEventBusCommand,
  PutRuleCommand,
  DeleteRuleCommand,
  PutTargetsCommand,
  RemoveTargetsCommand,
} = require('@aws-sdk/client-eventbridge');

const eventBridge = new EventBridgeClient({ maxAttempts: MAX_AWS_REQUEST_TRY });

async function createEventBus(config) {
  const { eventBus, region } = config;

  eventBridge.config.region = () => region;

  if (eventBus) {
    if (eventBus.startsWith('arn')) {
      return Promise.resolve();
    }
    return eventBridge.send(
      new CreateEventBusCommand({
        Name: eventBus,
      })
    );
  }
  return Promise.resolve();
}

async function deleteEventBus(config) {
  const { eventBus, region } = config;

  eventBridge.config.region = () => region;

  if (eventBus) {
    if (eventBus.startsWith('arn')) {
      return Promise.resolve();
    }

    return eventBridge.send(
      new DeleteEventBusCommand({
        Name: eventBus,
      })
    );
  }
  return Promise.resolve();
}

async function updateRuleConfiguration(config) {
  const { ruleName, eventBus, pattern, schedule, region, state } = config;

  eventBridge.config.region = () => region;

  const EventBusName = getEventBusName(eventBus);

  return eventBridge.send(
    new PutRuleCommand({
      Name: ruleName,
      EventBusName,
      EventPattern: JSON.stringify(pattern),
      ScheduleExpression: schedule,
      State: state,
    })
  );
}

async function removeRuleConfiguration(config) {
  const { ruleName, eventBus, region } = config;

  eventBridge.config.region = () => region;

  const EventBusName = getEventBusName(eventBus);

  return eventBridge.send(
    new DeleteRuleCommand({
      Name: ruleName,
      EventBusName,
    })
  );
}

async function updateTargetConfiguration(config) {
  const { lambdaArn, ruleName, eventBus, input, inputPath, inputTransformer, region } = config;

  eventBridge.config.region = () => region;

  const EventBusName = getEventBusName(eventBus);

  let target = {
    Arn: lambdaArn,
    Id: getEventBusTargetId(ruleName),
  };

  if (input) {
    target = Object.assign(target, { Input: JSON.stringify(input) });
  } else if (inputPath) {
    target = Object.assign(target, { InputPath: inputPath });
  } else if (inputTransformer) {
    target = Object.assign(target, { InputTransformer: inputTransformer });
  }

  return removeTargetConfiguration(config).then(() =>
    eventBridge.send(
      new PutTargetsCommand({
        Rule: ruleName,
        EventBusName,
        Targets: [target],
      })
    )
  );
}

async function removeTargetConfiguration(config) {
  const { ruleName, eventBus, region } = config;

  const EventBusName = getEventBusName(eventBus);

  eventBridge.config.region = () => region;

  return eventBridge.send(
    new RemoveTargetsCommand({
      Ids: [getEventBusTargetId(ruleName)],
      Rule: ruleName,
      EventBusName,
    })
  );
}

module.exports = {
  createEventBus,
  deleteEventBus,
  updateRuleConfiguration,
  removeRuleConfiguration,
  updateTargetConfiguration,
  removeTargetConfiguration,
};
