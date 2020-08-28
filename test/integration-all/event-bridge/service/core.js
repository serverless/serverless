'use strict';

// NOTE: the `utils.js` file is bundled into the deployment package
// eslint-disable-next-line
const { log } = require('./utils');

function eventBusDefault(event, context, callback) {
  const functionName = 'eventBusDefault';
  log(functionName, JSON.stringify(event));
  return callback(null, event);
}

function eventBusDefaultArn(event, context, callback) {
  const functionName = 'eventBusDefaultArn';
  log(functionName, JSON.stringify(event));
  return callback(null, event);
}

function eventBusCustom(event, context, callback) {
  const functionName = 'eventBusCustom';
  log(functionName, JSON.stringify(event));
  return callback(null, event);
}

function eventBusArn(event, context, callback) {
  const functionName = 'eventBusArn';
  log(functionName, JSON.stringify(event));
  return callback(null, event);
}

module.exports = { eventBusDefault, eventBusDefaultArn, eventBusCustom, eventBusArn };
