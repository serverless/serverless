'use strict';

const awsRequest = require('@serverless/test/aws-request');
const SQSService = require('aws-sdk').SQS;

function createSqsQueue(queueName) {
  const params = {
    QueueName: queueName,
  };

  return awsRequest(SQSService, 'createQueue', params);
}

function deleteSqsQueue(queueName) {
  return awsRequest(SQSService, 'getQueueUrl', { QueueName: queueName }).then((data) => {
    const params = {
      QueueUrl: data.QueueUrl,
    };
    return awsRequest(SQSService, 'deleteQueue', params);
  });
}

function sendSqsMessage(queueName, message) {
  return awsRequest(SQSService, 'getQueueUrl', { QueueName: queueName }).then((data) => {
    const params = {
      QueueUrl: data.QueueUrl,
      MessageBody: message,
    };
    return awsRequest(SQSService, 'sendMessage', params);
  });
}

module.exports = {
  createSqsQueue,
  deleteSqsQueue,
  sendSqsMessage,
};
