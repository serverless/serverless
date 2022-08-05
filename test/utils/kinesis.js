'use strict';

const BbPromise = require('bluebird');
const awsRequest = require('@serverless/test/aws-request');
const KinesisService = require('aws-sdk').Kinesis;

async function waitForKinesisStream(streamName) {
  const params = {
    StreamName: streamName,
  };
  return new BbPromise((resolve) => {
    const interval = setInterval(() => {
      awsRequest(KinesisService, 'describeStream', params).then((data) => {
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

async function createKinesisStream(streamName) {
  const params = {
    ShardCount: 1, // prevent complications from shards being processed in parallel
    StreamName: streamName,
  };

  return awsRequest(KinesisService, 'createStream', params).then(() =>
    waitForKinesisStream(streamName)
  );
}

async function deleteKinesisStream(streamName) {
  const params = {
    StreamName: streamName,
  };

  return awsRequest(KinesisService, 'deleteStream', params);
}

async function putKinesisRecord(streamName, message) {
  const params = {
    StreamName: streamName,
    Data: message,
    PartitionKey: streamName, // test streams are single shards
  };

  return awsRequest(KinesisService, 'putRecord', params);
}

module.exports = {
  createKinesisStream,
  deleteKinesisStream,
  putKinesisRecord,
};
