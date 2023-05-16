'use strict';

const awsRequest = require('@serverless/test/aws-request');
const SQSService = require('aws-sdk').SQS;

async function createSqsQueue(queueName) {
  const params = {
    QueueName: queueName,
  };

  return awsRequest(SQSService, 'createQueue', params);
}

async function deleteSqsQueue(queueName) {
  return awsRequest(SQSService, 'getQueueUrl', { QueueName: queueName }).then((data) => {
    const params = {
      QueueUrl: data.QueueUrl,
    };
    return awsRequest(SQSService, 'deleteQueue', params);
  });
}

async function sendSqsMessage(queueName, message) {
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
