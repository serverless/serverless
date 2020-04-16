'use strict';

// NOTE: the `utils.js` file is bundled into the deployment package
// eslint-disable-next-line
const { log } = require('./utils');

function scheduleMinimal(event, context, callback) {
  const functionName = 'scheduleMinimal';
  log(functionName, JSON.stringify(event));
  return callback(null, event);
}

function scheduleExtended(event, context, callback) {
  const functionName = 'scheduleExtended';
  log(functionName, JSON.stringify(event));
  return callback(null, event);
}

module.exports = { scheduleMinimal, scheduleExtended };
