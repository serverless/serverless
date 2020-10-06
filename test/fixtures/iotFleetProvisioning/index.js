'use strict';

function registerThing() {}

function iotFleetPreProvisioningHook(event, context, callback) {
  return callback(null, event);
}

module.exports = { registerThing, iotFleetPreProvisioningHook };
