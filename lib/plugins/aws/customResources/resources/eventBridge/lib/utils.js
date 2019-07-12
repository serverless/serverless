'use strict';

function getRuleName(eventBridgeName) {
  return `${eventBridgeName.toLowerCase()}-rule`;
}

function getEventBusName(eventBridgeConfig) {
  if (!eventBridgeConfig.eventBus) {
    return 'default';
  }
  // we're dealing with an ARN here, so we have to return its last part
  return eventBridgeConfig.eventBus.split('/').pop();
}

module.exports = {
  getRuleName,
  getEventBusName,
};
