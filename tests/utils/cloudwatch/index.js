'use strict';

const { awsRequest } = require('../misc');

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
