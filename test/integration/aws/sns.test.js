'use strict';

const { expect } = require('chai');
const log = require('log').get('serverless:test');
const fixtures = require('../../fixtures/programmatic');

const { confirmCloudWatchLogs } = require('../../utils/misc');
const { createSnsTopic, removeSnsTopic, publishSnsMessage } = require('../../utils/sns');
const { deployService, removeService } = require('../../utils/integration');

describe('AWS - SNS Integration Test', function () {
  this.timeout(1000 * 60 * 100); // Involves time-taking deploys
  let stackName;
  let serviceDir;
  let minimalTopicName;
  let filteredTopicName;
  let existingTopicName;
  const stage = 'dev';

  before(async () => {
    const serviceData = await fixtures.setup('sns');
    ({ servicePath: serviceDir } = serviceData);
    const serviceName = serviceData.serviceConfig.service;

    minimalTopicName = `${serviceName}-minimal`;
    filteredTopicName = `${serviceName}-filtered`;
    existingTopicName = `${serviceName}-existing`;

    stackName = `${serviceName}-${stage}`;
    // create "existing" SNS topics
    // NOTE: deployment can only be done once the SNS topics are created
    log.notice(`Creating SNS topic "${existingTopicName}"...`);
    await createSnsTopic(existingTopicName);
    return deployService(serviceDir);
  });

  after(async () => {
    await removeService(serviceDir);
    log.notice('Deleting SNS topics');
    return removeSnsTopic(existingTopicName);
  });

  describe('Minimal Setup', () => {
    it('should invoke on a topic message', async () => {
      const functionName = 'snsMinimal';
      const message = 'Hello from SNS!';

      const events = await confirmCloudWatchLogs(
        `/aws/lambda/${stackName}-${functionName}`,
        () => publishSnsMessage(minimalTopicName, message),
        {
          checkIsComplete: (soFarEvents) => {
            const logs = soFarEvents.reduce((data, event) => data + event.message, '');
            return logs.includes(message);
          },
        }
      );
      const logs = events.reduce((data, event) => data + event.message, '');
      expect(logs).to.include(functionName);
      expect(logs).to.include(message);
    });
  });

  describe('Multiple and Filtered Setup', async () => {
    it('should invoke on a topic message that matches filter', () => {
      const leftFunctionName = 'snsMultipleFilteredLeft';
      const rightFunctionName = 'snsMultipleFilteredRight';
      const leftMessage = 'Hello to the left-side from SNS!';
      const rightMessage = 'Hello to the right-side from SNS!';
      const middleMessage = 'Hello to the middle-side from SNS!';
      const leftAttributes = { side: { DataType: 'String', StringValue: 'left' } };
      const middleAttributes = { side: { DataType: 'String', StringValue: 'middle' } };
      const rightAttributes = { side: { DataType: 'String', StringValue: 'right' } };

      return Promise.all([
        confirmCloudWatchLogs(
          `/aws/lambda/${stackName}-${leftFunctionName}`,
          async () => {
            await publishSnsMessage(filteredTopicName, middleMessage, middleAttributes);
            await publishSnsMessage(filteredTopicName, leftMessage, leftAttributes);
          },
          {
            checkIsComplete: (events) =>
              events.reduce((data, event) => data + event.message, '').includes(leftMessage),
          }
        ).then((events) => {
          const logs = events.reduce((data, event) => data + event.message, '');
          expect(logs).to.include(leftFunctionName);
          expect(logs).to.include(leftMessage);
          expect(logs).not.to.include(middleMessage);
          expect(logs).not.to.include(rightMessage);
        }),
        confirmCloudWatchLogs(
          `/aws/lambda/${stackName}-${rightFunctionName}`,
          async () => {
            await publishSnsMessage(filteredTopicName, middleMessage, middleAttributes);
            await publishSnsMessage(filteredTopicName, rightMessage, rightAttributes);
          },
          {
            checkIsComplete: (events) =>
              events.reduce((data, event) => data + event.message, '').includes(rightMessage),
          }
        ).then((events) => {
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
    it('should invoke on an existing topic message', async () => {
      const functionName = 'snsExisting';
      const message = 'Hello from an existing SNS!';

      const events = await confirmCloudWatchLogs(
        `/aws/lambda/${stackName}-${functionName}`,
        () => publishSnsMessage(existingTopicName, message),
        {
          checkIsComplete: (soFarEvents) =>
            soFarEvents.reduce((data, event) => data + event.message, '').includes(message),
        }
      );
      const logs = events.reduce((data, event) => data + event.message, '');
      expect(logs).to.include(functionName);
      expect(logs).to.include(message);
    });
  });
});
