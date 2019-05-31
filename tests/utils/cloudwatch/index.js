'use strict';

const AWS = require('aws-sdk');
const { region, persistentRequest } = require('../misc');

function putCloudWatchEvents(sources) {
  const cwe = new AWS.CloudWatchEvents({ region });

  const entries = sources.map(source => ({
    Source: source,
    DetailType: 'serverlessDetailType',
    Detail: '{ "key1": "value1" }',
  }));
  const params = {
    Entries: entries,
  };
  return cwe.putEvents(params).promise();
}

module.exports = {
  putCloudWatchEvents: persistentRequest.bind(this, putCloudWatchEvents),
};
