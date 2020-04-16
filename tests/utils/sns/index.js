'use strict';

const awsRequest = require('@serverless/test/aws-request');

function createSnsTopic(topicName) {
  const params = {
    Name: topicName,
  };

  return awsRequest('SNS', 'createTopic', params);
}

function removeSnsTopic(topicName) {
  return awsRequest('SNS', 'listTopics').then(data => {
    const topicArn = data.Topics.find(topic => RegExp(topicName, 'g').test(topic.TopicArn))
      .TopicArn;

    const params = {
      TopicArn: topicArn,
    };

    return awsRequest('SNS', 'deleteTopic', params);
  });
}

function publishSnsMessage(topicName, message, messageAttributes = null) {
  return awsRequest('SNS', 'listTopics').then(data => {
    const topicArn = data.Topics.find(topic => RegExp(topicName, 'g').test(topic.TopicArn))
      .TopicArn;

    const params = {
      Message: message,
      TopicArn: topicArn,
    };
    if (messageAttributes) {
      params.MessageAttributes = messageAttributes;
    }

    return awsRequest('SNS', 'publish', params);
  });
}

module.exports = {
  createSnsTopic,
  removeSnsTopic,
  publishSnsMessage,
};
