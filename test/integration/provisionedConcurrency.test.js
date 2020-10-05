'use strict';

const { expect } = require('chai');
const log = require('log').get('serverless:test');
const fixtures = require('../fixtures');

const { createKinesisStream, deleteKinesisStream, putKinesisRecord } = require('../utils/kinesis');
const { createSqsQueue, deleteSqsQueue, sendSqsMessage } = require('../utils/sqs');
const { confirmCloudWatchLogs } = require('../utils/misc');
const { deployService, removeService } = require('../utils/integration');

describe('AWS - Provisioned Concurrency Integration Test', function() {
  this.timeout(1000 * 60 * 100); // Involves time-taking deploys
  let stackName;
  let servicePath;
  let queueName;
  let streamName;
  const stage = 'dev';

  before(async () => {
    const serviceData = await fixtures.setup('provisionedConcurrency');
    ({ servicePath } = serviceData);
    const serviceName = serviceData.serviceConfig.service;

    streamName = `${serviceName}-kinesis`;
    queueName = `${serviceName}-provisioned`;
    stackName = `${serviceName}-${stage}`;
    // NOTE: deployment can only be done once the SQS queue and Kinesis Stream is created
    log.notice(`Creating SQS queue "${queueName}"...`);
    await createSqsQueue(queueName);
    log.notice(`Creating Kinesis stream "${streamName}"...`);
    await createKinesisStream(streamName);
    return deployService(servicePath);
  });

  after(async () => {
    await removeService(servicePath);
    log.notice(`Deleting Kinesis stream "${streamName}"...`);
    await deleteKinesisStream(streamName);
    log.notice(`Deleting SQS queue "${queueName}"...`);
    return deleteSqsQueue(queueName);
  });

  it('should be correctly invoked by sqs event', async () => {
    const functionName = 'provisionedSqs';
    const message = 'Hello from SQS!';

    const events = await confirmCloudWatchLogs(`/aws/lambda/${stackName}-${functionName}`, () =>
      sendSqsMessage(queueName, message)
    );

    const logs = events.reduce((data, event) => data + event.message, '');
    expect(logs).to.include(functionName);
    expect(logs).to.include(message);
  });

  it('should be correctly invoked by kinesis event', async () => {
    const functionName = 'provisionedKinesis';
    const message = 'Hello from Kinesis!';

    const events = await confirmCloudWatchLogs(`/aws/lambda/${stackName}-${functionName}`, () =>
      putKinesisRecord(streamName, message)
    );

    const logs = events.reduce((data, event) => data + event.message, '');
    expect(logs).to.include(functionName);
    expect(logs).to.include(message);
  });
});
