'use strict';

const awsRequest = require('@serverless/test/aws-request');
const SNSService = require('aws-sdk').SNS;

async function createSnsTopic(topicName) {
  const params = {
    Name: topicName,
  };

  return awsRequest(SNSService, 'createTopic', params);
}

async function resolveTopicArn(topicName, nextToken = null) {
  return awsRequest(SNSService, 'listTopics', { NextToken: nextToken }).then((data) => {
    const targetTopic = data.Topics.find((topic) => RegExp(topicName, 'g').test(topic.TopicArn));

    if (targetTopic) return targetTopic.TopicArn;

    if (data.NextToken) return resolveTopicArn(topicName, data.NextToken);
    return null;
  });
}

async function removeSnsTopic(topicName) {
  return resolveTopicArn(topicName).then((topicArn) => {
    const params = {
      TopicArn: topicArn,
    };

    return awsRequest(SNSService, 'deleteTopic', params);
  });
}

async function publishSnsMessage(topicName, message, messageAttributes = null) {
  return resolveTopicArn(topicName).then((topicArn) => {
    const params = {
      Message: message,
      TopicArn: topicArn,
    };
    if (messageAttributes) {
      params.MessageAttributes = messageAttributes;
    }

    return awsRequest(SNSService, 'publish', params);
  });
}

module.exports = {
  createSnsTopic,
  removeSnsTopic,
  publishSnsMessage,
};
