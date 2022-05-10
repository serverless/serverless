'use strict';

const { expect } = require('chai');
const log = require('log').get('serverless:test');
const fixtures = require('../../fixtures/programmatic');

const {
  createKinesisStream,
  deleteKinesisStream,
  putKinesisRecord,
} = require('../../utils/kinesis');
const { putDynamoDbItem } = require('../../utils/dynamodb');
const { confirmCloudWatchLogs } = require('../../utils/misc');
const { deployService, removeService } = require('../../utils/integration');

describe('AWS - Stream Integration Test', function () {
  this.timeout(1000 * 60 * 100); // Involves time-taking deploys
  let stackName;
  let serviceDir;
  let streamName;
  let tableName;
  const historicStreamMessage = 'Hello from the Kinesis horizon!';
  const stage = 'dev';

  before(async () => {
    const serviceData = await fixtures.setup('stream');
    ({ servicePath: serviceDir } = serviceData);
    const serviceName = serviceData.serviceConfig.service;

    streamName = `${serviceName}-kinesis`;
    tableName = `${serviceName}-table`;
    stackName = `${serviceName}-${stage}`;
    // create existing SQS queue
    // NOTE: deployment can only be done once the SQS queue is created
    log.notice(`Creating Kinesis stream "${streamName}"...`);
    return createKinesisStream(streamName)
      .then(() => putKinesisRecord(streamName, historicStreamMessage))
      .then(() => deployService(serviceDir));
  });

  after(async () => {
    await removeService(serviceDir);
    log.notice('Deleting Kinesis stream');
    return deleteKinesisStream(streamName);
  });

  describe('Kinesis Streams', () => {
    it('should invoke on kinesis messages from the trim horizon', () => {
      const functionName = 'streamKinesis';
      const message = 'Hello from Kinesis!';

      return confirmCloudWatchLogs(
        `/aws/lambda/${stackName}-${functionName}`,
        () => putKinesisRecord(streamName, message),
        {
          checkIsComplete: (events) =>
            events.reduce((data, event) => data + event.message, '').includes(message),
        }
      ).then((events) => {
        const logs = events.reduce((data, event) => data + event.message, '');
        expect(logs).to.include(functionName);
        expect(logs).to.include(message);
        expect(logs).to.include(historicStreamMessage);
      });
    });
  });

  describe('DynamoDB Streams', () => {
    it('should invoke on dynamodb messages from the latest position', () => {
      const functionName = 'streamDynamoDb';
      const item = { id: String(Date.now()) };
      return confirmCloudWatchLogs(
        `/aws/lambda/${stackName}-${functionName}`,
        () => {
          item.hello = `from dynamo!${Math.random().toString(36).slice(2)}`;
          return putDynamoDbItem(tableName, item);
        },
        {
          checkIsComplete: (events) =>
            events.reduce((data, event) => data + event.message, '').includes(functionName),
        }
      ).then((events) => {
        const logs = events.reduce((data, event) => data + event.message, '');

        expect(logs).to.include(functionName);
        expect(logs).to.include('INSERT');
        expect(logs).to.include(item.id);
      });
    });
  });
});
