'use strict';

const awsRequest = require('@serverless/test/aws-request');
const wait = require('timers-ext/promise/sleep');

async function waitForKinesisStream(streamName) {
  const params = {
    StreamName: streamName,
  };

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const data = await awsRequest('Kinesis', 'describeStream', params);
    const status = data.StreamDescription.StreamStatus;
    if (status === 'ACTIVE') {
      return data;
    }
    await wait(2000);
  }
}

function createKinesisStream(streamName) {
  const params = {
    ShardCount: 1, // prevent complications from shards being processed in parallel
    StreamName: streamName,
  };

  return awsRequest('Kinesis', 'createStream', params).then(() => waitForKinesisStream(streamName));
}

function deleteKinesisStream(streamName) {
  const params = {
    StreamName: streamName,
  };

  return awsRequest('Kinesis', 'deleteStream', params);
}

function putKinesisRecord(streamName, message) {
  const params = {
    StreamName: streamName,
    Data: message,
    PartitionKey: streamName, // test streams are single shards
  };

  return awsRequest('Kinesis', 'putRecord', params);
}

module.exports = {
  createKinesisStream,
  deleteKinesisStream,
  putKinesisRecord,
};
