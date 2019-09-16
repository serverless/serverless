'use strict';

const AWS = require('aws-sdk');
const { region, persistentRequest } = require('../misc');

function createEventBus(name) {
  const eventBridge = new AWS.EventBridge({ region });

  return eventBridge.createEventBus({ Name: name }).promise();
}

function deleteEventBus(name) {
  const eventBridge = new AWS.EventBridge({ region });

  return eventBridge.deleteEventBus({ Name: name }).promise();
}

function putEvents(EventBusName, Entries) {
  const eventBridge = new AWS.EventBridge({ region });

  Entries.map(entry => (entry.EventBusName = EventBusName));
  const params = {
    Entries,
  };
  return eventBridge.putEvents(params).promise();
}

module.exports = {
  createEventBus: persistentRequest.bind(this, createEventBus),
  deleteEventBus: persistentRequest.bind(this, deleteEventBus),
  putEvents: persistentRequest.bind(this, putEvents),
};
