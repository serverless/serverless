'use strict';

const { awsRequest } = require('../../utils');
const { getEventBusName, getEventBusTargetId } = require('./utils');

async function createEventBus(config) {
  const { eventBus, region } = config;

  if (eventBus) {
    if (eventBus.startsWith('arn')) {
      return Promise.resolve();
    }
    return awsRequest({ name: 'EventBridge', params: { region } }, 'createEventBus', {
      Name: eventBus,
    });
  }
  return Promise.resolve();
}

async function deleteEventBus(config) {
  const { eventBus, region } = config;

  if (eventBus) {
    if (eventBus.startsWith('arn')) {
      return Promise.resolve();
    }

    return awsRequest({ name: 'EventBridge', params: { region } }, 'deleteEventBus', {
      Name: eventBus,
    });
  }
  return Promise.resolve();
}

async function updateRuleConfiguration(config) {
  const { ruleName, eventBus, pattern, schedule, region, state } = config;

  const EventBusName = getEventBusName(eventBus);

  return awsRequest({ name: 'EventBridge', params: { region } }, 'putRule', {
    Name: ruleName,
    EventBusName,
    EventPattern: JSON.stringify(pattern),
    ScheduleExpression: schedule,
    State: state,
  });
}

async function removeRuleConfiguration(config) {
  const { ruleName, eventBus, region } = config;

  const EventBusName = getEventBusName(eventBus);

  return awsRequest({ name: 'EventBridge', params: { region } }, 'deleteRule', {
    Name: ruleName,
    EventBusName,
  });
}

async function updateTargetConfiguration(config) {
  const { lambdaArn, ruleName, eventBus, input, inputPath, inputTransformer, region } = config;

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
    awsRequest({ name: 'EventBridge', params: { region } }, 'putTargets', {
      Rule: ruleName,
      EventBusName,
      Targets: [target],
    })
  );
}

async function removeTargetConfiguration(config) {
  const { ruleName, eventBus, region } = config;

  const EventBusName = getEventBusName(eventBus);

  return awsRequest({ name: 'EventBridge', params: { region } }, 'removeTargets', {
    Ids: [getEventBusTargetId(ruleName)],
    Rule: ruleName,
    EventBusName,
  });
}

module.exports = {
  createEventBus,
  deleteEventBus,
  updateRuleConfiguration,
  removeRuleConfiguration,
  updateTargetConfiguration,
  removeTargetConfiguration,
};
