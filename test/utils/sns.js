'use strict';

const awsRequest = require('@serverless/test/aws-request');

function createSnsTopic(topicName) {
  const params = {
    Name: topicName,
  };

  return awsRequest('SNS', 'createTopic', params);
}

function resolveTopicArn(topicName, nextToken = null) {
  return awsRequest('SNS', 'listTopics', { NextToken: nextToken }).then(data => {
    const targetTopic = data.Topics.find(topic => RegExp(topicName, 'g').test(topic.TopicArn));

    if (targetTopic) return targetTopic.TopicArn;

    if (data.NextToken) return resolveTopicArn(topicName, data.NextToken);
    return null;
  });
}

function removeSnsTopic(topicName) {
  return resolveTopicArn(topicName).then(topicArn => {
    const params = {
      TopicArn: topicArn,
    };

    return awsRequest('SNS', 'deleteTopic', params);
  });
}

function publishSnsMessage(topicName, message, messageAttributes = null) {
  return resolveTopicArn(topicName).then(topicArn => {
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
