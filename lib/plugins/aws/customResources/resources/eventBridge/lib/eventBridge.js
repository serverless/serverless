'use strict';

const EventBridge = require('aws-sdk/clients/eventbridge');
const { getEventBusName } = require('./utils');

function createEventBus(config) {
  const { eventBus, region } = config;

  if (eventBus) {
    if (eventBus.startsWith('arn')) {
      return Promise.resolve();
    }
    const eventBridge = new EventBridge({ region });
    return eventBridge
      .createEventBus({
        Name: eventBus,
      })
      .promise();
  }
  return Promise.resolve();
}

function deleteEventBus(config) {
  const { eventBus, region } = config;

  if (eventBus) {
    if (eventBus.startsWith('arn')) {
      return Promise.resolve();
    }

    const eventBridge = new EventBridge({ region });
    return eventBridge
      .deleteEventBus({
        Name: eventBus,
      })
      .promise();
  }
  return Promise.resolve();
}

function updateRuleConfiguration(config) {
  const { ruleName, eventBus, pattern, schedule, region } = config;
  const eventBridge = new EventBridge({ region });

  const EventBusName = getEventBusName(eventBus);

  return eventBridge
    .putRule({
      Name: ruleName,
      EventBusName,
      EventPattern: JSON.stringify(pattern),
      ScheduleExpression: schedule,
      State: 'ENABLED',
    })
    .promise();
}

function removeRuleConfiguration(config) {
  const { ruleName, eventBus, region } = config;
  const eventBridge = new EventBridge({ region });

  const EventBusName = getEventBusName(eventBus);

  return eventBridge
    .deleteRule({
      Name: ruleName,
      EventBusName,
    })
    .promise();
}

function updateTargetConfiguration(config) {
  const { lambdaArn, ruleName, eventBus, input, inputPath, inputTransformer, region } = config;
  const eventBridge = new EventBridge({ region });

  const EventBusName = getEventBusName(eventBus);

  let target = {
    Arn: lambdaArn,
    Id: `${ruleName}-target`,
  };

  if (input) {
    target = Object.assign(target, { Input: JSON.stringify(input) });
  } else if (inputPath) {
    target = Object.assign(target, { InputPath: inputPath });
  } else if (inputTransformer) {
    target = Object.assign(target, { InputTransformer: inputTransformer });
  }

  return removeTargetConfiguration(config).then(() =>
    eventBridge
      .putTargets({
        Rule: ruleName,
        EventBusName,
        Targets: [target],
      })
      .promise()
  );
}

function removeTargetConfiguration(config) {
  const { ruleName, eventBus, region } = config;
  const eventBridge = new EventBridge({ region });

  const EventBusName = getEventBusName(eventBus);

  return eventBridge
    .removeTargets({
      Ids: [`${ruleName}-target`],
      Rule: ruleName,
      EventBusName,
    })
    .promise();
}

module.exports = {
  createEventBus,
  deleteEventBus,
  updateRuleConfiguration,
  removeRuleConfiguration,
  updateTargetConfiguration,
  removeTargetConfiguration,
};
