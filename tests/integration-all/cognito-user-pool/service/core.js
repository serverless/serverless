'use strict';

// NOTE: the `utils.js` file is bundled into the deployment package
// eslint-disable-next-line
const { log } = require('./utils');

function basic(event, context, callback) {
  const functionName = 'basic';
  const nextEvent = Object.assign({}, event);
  nextEvent.response.autoConfirmUser = true;

  log(functionName, JSON.stringify(nextEvent));
  return callback(null, nextEvent);
}

function existing(event, context, callback) {
  const functionName = 'existing';
  const nextEvent = Object.assign({}, event);
  nextEvent.response.autoConfirmUser = true;

  log(functionName, JSON.stringify(nextEvent));
  return callback(null, nextEvent);
}

module.exports = { basic, existing };
