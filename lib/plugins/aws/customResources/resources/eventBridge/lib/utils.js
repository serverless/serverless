'use strict';

function getEventBusName(eventBus) {
  if (eventBus && eventBus.startsWith('arn')) {
    return eventBus.split('/').pop();
  }
  return eventBus;
}

module.exports = {
  getEventBusName,
};
