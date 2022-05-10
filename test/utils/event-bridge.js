'use strict';

const awsRequest = require('@serverless/test/aws-request');
const EventBridgeService = require('aws-sdk').EventBridge;

function createEventBus(name) {
  return awsRequest(EventBridgeService, 'createEventBus', { Name: name });
}

function deleteEventBus(name) {
  return awsRequest(EventBridgeService, 'deleteEventBus', { Name: name });
}

function describeEventBus(name) {
  return awsRequest(EventBridgeService, 'describeEventBus', { Name: name });
}

function putEvents(EventBusName, Entries) {
  Entries.map((entry) => (entry.EventBusName = EventBusName));
  const params = {
    Entries,
  };
  return awsRequest(EventBridgeService, 'putEvents', params);
}

module.exports = {
  createEventBus,
  deleteEventBus,
  describeEventBus,
  putEvents,
};
