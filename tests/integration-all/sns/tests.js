'use strict';

const path = require('path');
const BbPromise = require('bluebird');
const { expect } = require('chai');

const { getTmpDirPath } = require('../../utils/fs');
const { createSnsTopic, removeSnsTopic, publishSnsMessage } = require('../../utils/sns');
const {
  createTestService,
  deployService,
  removeService,
  waitForFunctionLogs,
} = require('../../utils/integration');
const { getMarkers } = require('../shared/utils');

describe('AWS - SNS Integration Test', function() {
  this.timeout(1000 * 60 * 100); // Involves time-taking deploys
  let serviceName;
  let stackName;
  let tmpDirPath;
  let minimalTopicName;
  let filteredTopicName;
  let existingTopicName;
  const stage = 'dev';

  before(async () => {
    tmpDirPath = getTmpDirPath();
    console.info(`Temporary path: ${tmpDirPath}`);
    const serverlessConfig = await createTestService(tmpDirPath, {
      templateDir: path.join(__dirname, 'service'),
      filesToAdd: [path.join(__dirname, '..', 'shared')],
      serverlessConfigHook:
        // Ensure unique topics (to avoid collision among concurrent CI runs)
        config => {
          minimalTopicName = `${config.service}-minimal`;
          filteredTopicName = `${config.service}-filtered`;
          const filteredDisplayName = `Integration Test: ${config.service}-filtered`;
          existingTopicName = `${config.service}-existing`;
          config.functions.snsMinimal.events[0].sns = minimalTopicName;
          config.functions.snsMultipleFilteredLeft.events[0].sns.topicName = filteredTopicName;
          config.functions.snsMultipleFilteredRight.events[0].sns.topicName = filteredTopicName;
          config.functions.snsMultipleFilteredLeft.events[0].sns.displayName = filteredDisplayName;
          config.functions.snsMultipleFilteredRight.events[0].sns.displayName = filteredDisplayName;
          config.functions.snsExisting.events[0].sns.arn['Fn::Join'][1][3] = existingTopicName;
          config.functions.snsExisting.events[0].sns.topicName = existingTopicName;
        },
    });
    serviceName = serverlessConfig.service;
    stackName = `${serviceName}-${stage}`;
    // create "existing" SNS topics
    // NOTE: deployment can only be done once the SNS topics are created
    console.info(`Creating SNS topic "${existingTopicName}"...`);
    return createSnsTopic(existingTopicName).then(() => {
      console.info(`Deploying "${stackName}" service...`);
      return deployService(tmpDirPath);
    });
  });

  after(async () => {
    console.info('Removing service...');
    await removeService(tmpDirPath);
    console.info('Deleting SNS topics');
    return removeSnsTopic(existingTopicName);
  });

  describe('Minimal Setup', () => {
    it('should invoke on a topic message', () => {
      const functionName = 'snsMinimal';
      const markers = getMarkers(functionName);
      const message = 'Hello from SNS!';

      return publishSnsMessage(minimalTopicName, message)
        .then(() => waitForFunctionLogs(tmpDirPath, functionName, markers.start, markers.end))
        .then(logs => {
          expect(logs).to.include(functionName);
          expect(logs).to.include(message);
        });
    });
  });

  describe('Multiple and Filtered Setup', () => {
    it('should invoke on a topic message that matches filter', () => {
      const leftFunctionName = 'snsMultipleFilteredLeft';
      const leftMarkers = getMarkers(leftFunctionName);
      const rightFunctionName = 'snsMultipleFilteredRight';
      const rightMarkers = getMarkers(rightFunctionName);
      const leftMessage = 'Hello to the left-side from SNS!';
      const rightMessage = 'Hello to the right-side from SNS!';
      const middleMessage = 'Hello to the middle-side from SNS!';
      const leftAttributes = { side: { DataType: 'String', StringValue: 'left' } };
      const middleAttributes = { side: { DataType: 'String', StringValue: 'middle' } };
      const rightAttributes = { side: { DataType: 'String', StringValue: 'right' } };

      return BbPromise.all([
        publishSnsMessage(filteredTopicName, leftMessage, leftAttributes),
        publishSnsMessage(filteredTopicName, middleMessage, middleAttributes),
        publishSnsMessage(filteredTopicName, rightMessage, rightAttributes),
      ])
        .then(() =>
          BbPromise.all([
            waitForFunctionLogs(tmpDirPath, leftFunctionName, leftMarkers.start, leftMarkers.end),
            waitForFunctionLogs(
              tmpDirPath,
              rightFunctionName,
              rightMarkers.start,
              rightMarkers.end
            ),
          ])
        )
        .then(logs => {
          const leftLogs = logs[0];
          const rightLogs = logs[1];
          // left side is filtered to only get "left" messages from topic:
          expect(leftLogs).to.include(leftFunctionName);
          expect(leftLogs).to.include(leftMessage);
          expect(leftLogs).not.to.include(middleMessage);
          expect(leftLogs).not.to.include(rightMessage);
          // right side is filtered to only get "right" messages from topic:
          expect(rightLogs).to.include(rightFunctionName);
          expect(rightLogs).not.to.include(leftMessage);
          expect(rightLogs).not.to.include(middleMessage);
          expect(rightLogs).to.include(rightMessage);
          // "middle" messages will not cause an invocation.
        });
    });
  });

  describe('Existing Setup', () => {
    it('should invoke on an existing topic message', () => {
      const functionName = 'snsExisting';
      const markers = getMarkers(functionName);
      const message = 'Hello from an existing SNS!';

      return publishSnsMessage(existingTopicName, message)
        .then(() => waitForFunctionLogs(tmpDirPath, functionName, markers.start, markers.end))
        .then(logs => {
          expect(logs).to.include(functionName);
          expect(logs).to.include(message);
        });
    });
  });
});
