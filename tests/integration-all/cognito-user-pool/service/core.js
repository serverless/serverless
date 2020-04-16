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

function existingSimple(event, context, callback) {
  const functionName = 'existingSimple';
  const nextEvent = Object.assign({}, event);
  nextEvent.response.autoConfirmUser = true;

  log(functionName, JSON.stringify(nextEvent));
  return callback(null, nextEvent);
}

function existingMulti(event, context, callback) {
  const functionName = 'existingMulti';

  log(functionName, JSON.stringify(event));
  return callback(null, event);
}

module.exports = { basic, existingSimple, existingMulti };
