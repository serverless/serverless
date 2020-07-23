'use strict';

const path = require('path');
const BbPromise = require('bluebird');
const { expect } = require('chai');

const { getTmpDirPath } = require('../../utils/fs');
const { confirmCloudWatchLogs } = require('../../utils/misc');
const { createSnsTopic, removeSnsTopic, publishSnsMessage } = require('../../utils/sns');
const { createTestService, deployService, removeService } = require('../../utils/integration');

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
      const message = 'Hello from SNS!';

      return confirmCloudWatchLogs(`/aws/lambda/${stackName}-${functionName}`, () =>
        publishSnsMessage(minimalTopicName, message)
      ).then(events => {
        const logs = events.reduce((data, event) => data + event.message, '');
        expect(logs).to.include(functionName);
        expect(logs).to.include(message);
      });
    });
  });

  describe('Multiple and Filtered Setup', () => {
    it('should invoke on a topic message that matches filter', () => {
      const leftFunctionName = 'snsMultipleFilteredLeft';
      const rightFunctionName = 'snsMultipleFilteredRight';
      const leftMessage = 'Hello to the left-side from SNS!';
      const rightMessage = 'Hello to the right-side from SNS!';
      const middleMessage = 'Hello to the middle-side from SNS!';
      const leftAttributes = { side: { DataType: 'String', StringValue: 'left' } };
      const middleAttributes = { side: { DataType: 'String', StringValue: 'middle' } };
      const rightAttributes = { side: { DataType: 'String', StringValue: 'right' } };

      return BbPromise.all([
        confirmCloudWatchLogs(`/aws/lambda/${stackName}-${leftFunctionName}`, async () => {
          await publishSnsMessage(filteredTopicName, middleMessage, middleAttributes);
          await publishSnsMessage(filteredTopicName, leftMessage, leftAttributes);
        }).then(events => {
          const logs = events.reduce((data, event) => data + event.message, '');
          expect(logs).to.include(leftFunctionName);
          expect(logs).to.include(leftMessage);
          expect(logs).not.to.include(middleMessage);
          expect(logs).not.to.include(rightMessage);
        }),
        confirmCloudWatchLogs(`/aws/lambda/${stackName}-${rightFunctionName}`, async () => {
          await publishSnsMessage(filteredTopicName, middleMessage, middleAttributes);
          await publishSnsMessage(filteredTopicName, rightMessage, rightAttributes);
        }).then(events => {
          const logs = events.reduce((data, event) => data + event.message, '');
          expect(logs).to.include(rightFunctionName);
          expect(logs).not.to.include(leftMessage);
          expect(logs).not.to.include(middleMessage);
          expect(logs).to.include(rightMessage);
        }),
      ]);
    });
  });

  describe('Existing Setup', () => {
    it('should invoke on an existing topic message', () => {
      const functionName = 'snsExisting';
      const message = 'Hello from an existing SNS!';

      return confirmCloudWatchLogs(`/aws/lambda/${stackName}-${functionName}`, () =>
        publishSnsMessage(existingTopicName, message)
      ).then(events => {
        const logs = events.reduce((data, event) => data + event.message, '');
        expect(logs).to.include(functionName);
        expect(logs).to.include(message);
      });
    });
  });
});
