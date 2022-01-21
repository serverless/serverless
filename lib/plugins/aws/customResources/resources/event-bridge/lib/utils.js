'use strict';

const crypto = require('crypto');

function getEventBusName(eventBus) {
  if (eventBus && eventBus.startsWith('arn')) {
    return eventBus.slice(eventBus.indexOf('/') + 1);
  }
  return eventBus;
}

function getEventBusTargetId(ruleName) {
  const targetIdSuffix = 'target';
  let targetId = `${ruleName}-${targetIdSuffix}`;
  if (targetId.length > 64) {
    // Target ids cannot be longer than 64.
    targetId = `${targetId.slice(0, 31 - targetIdSuffix.length)}${crypto
      .createHash('md5')
      .update(targetId)
      .digest('hex')}-${targetIdSuffix}`;
  }

  return targetId;
}

module.exports = {
  getEventBusName,
  getEventBusTargetId,
};
