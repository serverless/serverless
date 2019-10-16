'use strict';

const AWS = require('aws-sdk');
const { region, persistentRequest } = require('../misc');

function createSqsQueue(queueName) {
  const SQS = new AWS.SQS({ region });

  const params = {
    QueueName: queueName,
  };

  return SQS.createQueue(params).promise();
}

function deleteSqsQueue(queueName) {
  const SQS = new AWS.SQS({ region });

  return SQS.getQueueUrl({ QueueName: queueName })
    .promise()
    .then(data => {
      const params = {
        QueueUrl: data.QueueUrl,
      };
      return SQS.deleteQueue(params).promise();
    });
}

function sendSqsMessage(queueName, message) {
  const SQS = new AWS.SQS({ region });

  return SQS.getQueueUrl({ QueueName: queueName })
    .promise()
    .then(data => {
      const params = {
        QueueUrl: data.QueueUrl,
        MessageBody: message,
      };
      return SQS.sendMessage(params).promise();
    });
}

module.exports = {
  createSqsQueue: persistentRequest.bind(this, createSqsQueue),
  deleteSqsQueue: persistentRequest.bind(this, deleteSqsQueue),
  sendSqsMessage: persistentRequest.bind(this, sendSqsMessage),
};
