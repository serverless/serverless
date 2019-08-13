'use strict';

function getEventBusName(eventBus) {
  if (eventBus && eventBus.startsWith('arn')) {
    return eventBus.slice(eventBus.indexOf('/') + 1);
  }
  return eventBus;
}

module.exports = {
  getEventBusName,
};
