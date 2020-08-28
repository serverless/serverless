'use strict';

const BbPromise = require('bluebird');
const awsRequest = require('@serverless/test/aws-request');

function waitForKinesisStream(streamName) {
  const params = {
    StreamName: streamName,
  };
  return new BbPromise(resolve => {
    const interval = setInterval(() => {
      awsRequest('Kinesis', 'describeStream', params).then(data => {
        const status = data.StreamDescription.StreamStatus;
        if (status === 'ACTIVE') {
          clearInterval(interval);
          return resolve(data);
        }
        return null;
      });
    }, 2000);
  });
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
