'use strict';

const awsRequest = require('@serverless/test/aws-request');

function createSqsQueue(queueName) {
  const params = {
    QueueName: queueName,
  };

  return awsRequest('SQS', 'createQueue', params);
}

function deleteSqsQueue(queueName) {
  return awsRequest('SQS', 'getQueueUrl', { QueueName: queueName }).then(data => {
    const params = {
      QueueUrl: data.QueueUrl,
    };
    return awsRequest('SQS', 'deleteQueue', params);
  });
}

function sendSqsMessage(queueName, message) {
  return awsRequest('SQS', 'getQueueUrl', { QueueName: queueName }).then(data => {
    const params = {
      QueueUrl: data.QueueUrl,
      MessageBody: message,
    };
    return awsRequest('SQS', 'sendMessage', params);
  });
}

module.exports = {
  createSqsQueue,
  deleteSqsQueue,
  sendSqsMessage,
};
