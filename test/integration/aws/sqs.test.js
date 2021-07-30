'use strict';

const { expect } = require('chai');
const hasFailed = require('@serverless/test/has-failed');
const log = require('log').get('serverless:test');
const fixtures = require('../../fixtures/programmatic');

const { createSqsQueue, deleteSqsQueue, sendSqsMessage } = require('../../utils/sqs');
const { confirmCloudWatchLogs } = require('../../utils/misc');
const { deployService, removeService } = require('../../utils/integration');

describe('AWS - SQS Integration Test', function () {
  this.timeout(1000 * 60 * 100); // Involves time-taking deploys
  let stackName;
  let serviceDir;
  let queueName;
  const stage = 'dev';

  before(async () => {
    const serviceData = await fixtures.setup('sqs');
    ({ servicePath: serviceDir } = serviceData);
    const serviceName = serviceData.serviceConfig.service;

    queueName = `${serviceName}-basic`;
    stackName = `${serviceName}-${stage}`;
    // create existing SQS queue
    // NOTE: deployment can only be done once the SQS queue is created
    log.notice(`Creating SQS queue "${queueName}"...`);
    return createSqsQueue(queueName).then(() => {
      return deployService(serviceDir);
    });
  });

  after(async function () {
    if (hasFailed(this.test.parent)) return null;
    await removeService(serviceDir);
    log.notice('Deleting SQS queue');
    return deleteSqsQueue(queueName);
  });

  describe('Basic Setup', () => {
    it('should invoke on queue message(s)', () => {
      const functionName = 'sqsBasic';
      const message = 'Hello from SQS!';

      return confirmCloudWatchLogs(
        `/aws/lambda/${stackName}-${functionName}`,
        () => sendSqsMessage(queueName, message),
        {
          checkIsComplete: (events) =>
            events.reduce((data, event) => data + event.message, '').includes(message),
        }
      ).then((events) => {
        const logs = events.reduce((data, event) => data + event.message, '');
        expect(logs).to.include(functionName);
        expect(logs).to.include(message);
      });
    });
  });
});
