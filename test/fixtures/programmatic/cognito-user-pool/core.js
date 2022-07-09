'use strict';

// NOTE: the `utils.js` file is bundled into the deployment package

const { log } = require('./utils');

function basic(event, context, callback) {
  const functionName = 'basic';
  const nextEvent = Object.assign({}, event);
  nextEvent.response.autoConfirmUser = true;

  log(functionName, JSON.stringify(nextEvent));
  return callback(null, nextEvent);
}

function customEmailSender(event, context, callback) {
  const functionName = 'customEmailSender';

  log(functionName, JSON.stringify(event));
  return callback(null, event);
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

function existingCustomEmailSender(event, context, callback) {
  const functionName = 'existingCustomEmailSender';

  log(functionName, JSON.stringify(event));
  return callback(null, event);
}

module.exports = {
  basic,
  customEmailSender,
  existingSimple,
  existingMulti,
  existingCustomEmailSender,
};
