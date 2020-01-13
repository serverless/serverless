'use strict';

const awsRequest = require('@serverless/test/aws-request');

function putCloudWatchEvents(sources) {
  const entries = sources.map(source => ({
    Source: source,
    DetailType: 'serverlessDetailType',
    Detail: '{ "key1": "value1" }',
  }));
  const params = {
    Entries: entries,
  };
  return awsRequest('CloudWatchEvents', 'putEvents', params);
}

module.exports = {
  putCloudWatchEvents,
};
