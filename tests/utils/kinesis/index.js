'use strict';

const AWS = require('aws-sdk');
const BbPromise = require('bluebird');
const { region, persistentRequest } = require('../misc');

function waitForKinesisStream(streamName) {
  const Kinesis = new AWS.Kinesis({ region });
  const params = {
    StreamName: streamName,
  };
  return new BbPromise(resolve => {
    const interval = setInterval(() => {
      Kinesis.describeStream(params)
        .promise()
        .then(data => {
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
  const Kinesis = new AWS.Kinesis({ region });

  const params = {
    ShardCount: 1, // prevent complications from shards being processed in parallel
    StreamName: streamName,
  };

  return Kinesis.createStream(params)
    .promise()
    .then(() => waitForKinesisStream(streamName));
}

function deleteKinesisStream(streamName) {
  const Kinesis = new AWS.Kinesis({ region });

  const params = {
    StreamName: streamName,
  };

  return Kinesis.deleteStream(params).promise();
}

function putKinesisRecord(streamName, message) {
  const Kinesis = new AWS.Kinesis({ region });

  const params = {
    StreamName: streamName,
    Data: message,
    PartitionKey: streamName, // test streams are single shards
  };

  return Kinesis.putRecord(params).promise();
}

module.exports = {
  createKinesisStream: persistentRequest.bind(this, createKinesisStream),
  deleteKinesisStream: persistentRequest.bind(this, deleteKinesisStream),
  putKinesisRecord: persistentRequest.bind(this, putKinesisRecord),
};
