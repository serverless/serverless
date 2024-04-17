'use strict';

const { awsRequest } = require('../../utils');
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

async function createEventBus(config) {
  const { eventBus, region } = config;

  if (eventBus) {
    if (eventBus.startsWith('arn')) {
      return Promise.resolve();
    }
    const client = new EventBridgeClient({ region });
    return awsRequest(() => client.send(new CreateEventBusCommand({ Name: eventBus })));
  }
  return Promise.resolve();
}

async function deleteEventBus(config) {
  const { eventBus, region } = config;

  if (eventBus) {
    if (eventBus.startsWith('arn')) {
      return Promise.resolve();
    }

    const client = new EventBridgeClient({ region });
    return awsRequest(() => client.send(new DeleteEventBusCommand({ Name: eventBus })));
  }
  return Promise.resolve();
}

async function updateRuleConfiguration(config) {
  const { ruleName, eventBus, pattern, schedule, region, state } = config;

  const EventBusName = getEventBusName(eventBus);

  const client = new EventBridgeClient({ region });
  return awsRequest(() =>
    client.send(
      new PutRuleCommand({
        Name: ruleName,
        EventBusName,
        EventPattern: JSON.stringify(pattern),
        ScheduleExpression: schedule,
        State: state,
      })
    )
  );
}

async function removeRuleConfiguration(config) {
  const { ruleName, eventBus, region } = config;

  const EventBusName = getEventBusName(eventBus);

  const client = new EventBridgeClient({ region });
  return awsRequest(() =>
    client.send(
      new DeleteRuleCommand({
        Name: ruleName,
        EventBusName,
      })
    )
  );
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

  const client = new EventBridgeClient({ region });

  return removeTargetConfiguration(config).then(() =>
    awsRequest(() =>
      client.send(
        new PutTargetsCommand({
          Rule: ruleName,
          EventBusName,
          Targets: [target],
        })
      )
    )
  );
}

async function removeTargetConfiguration(config) {
  const { ruleName, eventBus, region } = config;

  const EventBusName = getEventBusName(eventBus);

  const client = new EventBridgeClient({ region });
  return awsRequest(() =>
    client.send(
      new RemoveTargetsCommand({
        Ids: [getEventBusTargetId(ruleName)],
        Rule: ruleName,
        EventBusName,
      })
    )
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
