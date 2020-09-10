'use strict';

const BbPromise = require('bluebird');
const { expect } = require('chai');
const log = require('log').get('serverless:test');
const fixtures = require('../fixtures');

const { confirmCloudWatchLogs } = require('../utils/misc');
const { createSnsTopic, removeSnsTopic, publishSnsMessage } = require('../utils/sns');
const { deployService, removeService } = require('../utils/integration');

describe('AWS - SNS Integration Test', function() {
  this.timeout(1000 * 60 * 100); // Involves time-taking deploys
  let stackName;
  let servicePath;
  let minimalTopicName;
  let filteredTopicName;
  let existingTopicName;
  const stage = 'dev';

  before(async () => {
    const serviceData = await fixtures.setup('sns');
    ({ servicePath } = serviceData);
    const serviceName = serviceData.serviceConfig.service;

    minimalTopicName = `${serviceName}-minimal`;
    filteredTopicName = `${serviceName}-filtered`;
    existingTopicName = `${serviceName}-existing`;

    stackName = `${serviceName}-${stage}`;
    // create "existing" SNS topics
    // NOTE: deployment can only be done once the SNS topics are created
    log.notice(`Creating SNS topic "${existingTopicName}"...`);
    return createSnsTopic(existingTopicName).then(() => {
      return deployService(servicePath);
    });
  });

  after(async () => {
    await removeService(servicePath);
    log.notice('Deleting SNS topics');
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
