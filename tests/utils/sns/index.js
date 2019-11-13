'use strict';

const AWS = require('aws-sdk');
const { region, persistentRequest } = require('../misc');

function createSnsTopic(topicName) {
  const SNS = new AWS.SNS({ region });

  const params = {
    Name: topicName,
  };

  return SNS.createTopic(params).promise();
}

function removeSnsTopic(topicName) {
  const SNS = new AWS.SNS({ region });

  return SNS.listTopics()
    .promise()
    .then(data => {
      const topicArn = data.Topics.find(topic => RegExp(topicName, 'g').test(topic.TopicArn))
        .TopicArn;

      const params = {
        TopicArn: topicArn,
      };

      return SNS.deleteTopic(params).promise();
    });
}

function publishSnsMessage(topicName, message, messageAttributes = null) {
  const SNS = new AWS.SNS({ region });

  return SNS.listTopics()
    .promise()
    .then(data => {
      const topicArn = data.Topics.find(topic => RegExp(topicName, 'g').test(topic.TopicArn))
        .TopicArn;

      const params = {
        Message: message,
        TopicArn: topicArn,
      };
      if (messageAttributes) {
        params.MessageAttributes = messageAttributes;
      }

      return SNS.publish(params).promise();
    });
}

module.exports = {
  createSnsTopic: persistentRequest.bind(this, createSnsTopic),
  removeSnsTopic: persistentRequest.bind(this, removeSnsTopic),
  publishSnsMessage: persistentRequest.bind(this, publishSnsMessage),
};
