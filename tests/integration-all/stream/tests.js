'use strict';

const path = require('path');
const { expect } = require('chai');

const { getTmpDirPath } = require('../../utils/fs');
const {
  createKinesisStream,
  deleteKinesisStream,
  putKinesisRecord,
} = require('../../utils/kinesis');
const { putDynamoDbItem } = require('../../utils/dynamodb');
const {
  createTestService,
  deployService,
  removeService,
  waitForFunctionLogs,
} = require('../../utils/integration');
const { getMarkers } = require('../shared/utils');

describe('AWS - Stream Integration Test', function() {
  this.timeout(1000 * 60 * 100); // Involves time-taking deploys
  let serviceName;
  let stackName;
  let tmpDirPath;
  let streamName;
  let tableName;
  const historicStreamMessage = 'Hello from the Kinesis horizon!';
  const stage = 'dev';

  before(async () => {
    tmpDirPath = getTmpDirPath();
    console.info(`Temporary path: ${tmpDirPath}`);
    const serverlessConfig = await createTestService(tmpDirPath, {
      templateDir: path.join(__dirname, 'service'),
      filesToAdd: [path.join(__dirname, '..', 'shared')],
      serverlessConfigHook:
        // Ensure unique queues (to avoid collision among concurrent CI runs)
        config => {
          streamName = `${config.service}-kinesis`;
          tableName = `${config.service}-table`;
          config.functions.streamKinesis.events[0].stream.arn[
            'Fn::Join'
          ][1][5] = `stream/${streamName}`;
          config.resources.Resources.DynamoDbTable.Properties.TableName = tableName;
        },
    });
    serviceName = serverlessConfig.service;
    stackName = `${serviceName}-${stage}`;
    // create existing SQS queue
    // NOTE: deployment can only be done once the SQS queue is created
    console.info(`Creating Kinesis stream "${streamName}"...`);
    return createKinesisStream(streamName)
      .then(() => putKinesisRecord(streamName, historicStreamMessage))
      .then(() => {
        console.info(
          `Deploying "${stackName}" service with DynamoDB table resource "${tableName}"...`
        );
        return deployService(tmpDirPath);
      });
  });

  after(async () => {
    console.info(`Removing service (and DynamoDB table resource "${tableName}")...`);
    await removeService(tmpDirPath);
    console.info('Deleting Kinesis stream');
    return deleteKinesisStream(streamName);
  });

  describe('Kinesis Streams', () => {
    it('should invoke on kinesis messages from the trim horizon', () => {
      const functionName = 'streamKinesis';
      const markers = getMarkers(functionName);
      const message = 'Hello from Kinesis!';

      return putKinesisRecord(streamName, message)
        .then(() => waitForFunctionLogs(tmpDirPath, functionName, markers.start, markers.end))
        .then(logs => {
          expect(logs).to.include(functionName);
          expect(logs).to.include(message);
          expect(logs).to.include(historicStreamMessage);
        });
    });
  });

  describe('DynamoDB Streams', () => {
    it('should invoke on dynamodb messages from the latest position', () => {
      const functionName = 'streamDynamoDb';
      const markers = getMarkers(functionName);
      const item = { id: 'message', hello: 'from dynamo!' };

      return putDynamoDbItem(tableName, item)
        .then(() => waitForFunctionLogs(tmpDirPath, functionName, markers.start, markers.end))
        .then(logs => {
          expect(logs).to.include(functionName);
          expect(logs).to.include('INSERT');
          expect(logs).to.include(item.id);
        });
    });
  });
});
