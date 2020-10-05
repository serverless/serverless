'use strict';

// NOTE: the `utils.js` file is bundled into the deployment package
// eslint-disable-next-line
const { log } = require('./utils');

function iotFleetPreProvisioningHook(event, context, callback) {
  const functionName = 'iotFleetPreProvisioningHook';
  log(functionName, JSON.stringify(event));
  return callback(null, event);
}

module.exports = { iotFleetPreProvisioningHook };
