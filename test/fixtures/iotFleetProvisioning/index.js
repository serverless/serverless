'use strict';

function iotFleetPreProvisioningHook(event, context, callback) {
  return callback(null, event);
}

module.exports = { iotFleetPreProvisioningHook };
