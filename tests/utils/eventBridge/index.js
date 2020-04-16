'use strict';

const awsRequest = require('@serverless/test/aws-request');

function createEventBus(name) {
  return awsRequest('EventBridge', 'createEventBus', { Name: name });
}

function deleteEventBus(name) {
  return awsRequest('EventBridge', 'deleteEventBus', { Name: name });
}

function putEvents(EventBusName, Entries) {
  Entries.map(entry => (entry.EventBusName = EventBusName));
  const params = {
    Entries,
  };
  return awsRequest('EventBridge', 'putEvents', params);
}

module.exports = {
  createEventBus,
  deleteEventBus,
  putEvents,
};
