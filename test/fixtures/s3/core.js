'use strict';

// NOTE: the `utils.js` file is bundled into the deployment package
// eslint-disable-next-line
const { log } = require('./utils');

function minimal(event, context, callback) {
  const functionName = 'minimal';
  const response = { message: `Hello from S3! - (${functionName})`, event };
  const message = [
    event.Records[0].eventSource,
    event.Records[0].eventName,
    ' ',
    response.message,
  ].join('');
  log(functionName, message);
  return callback(null, response);
}

function extended(event, context, callback) {
  const functionName = 'extended';
  const response = { message: `Hello from S3! - (${functionName})`, event };
  const message = [
    event.Records[0].eventSource,
    event.Records[0].eventName,
    ' ',
    response.message,
  ].join('');
  log(functionName, message);
  return callback(null, response);
}

function custom(event, context, callback) {
  const functionName = 'custom';
  const response = { message: `Hello from S3! - (${functionName})`, event };
  const message = [
    event.Records[0].eventSource,
    event.Records[0].eventName,
    ' ',
    response.message,
  ].join('');
  log(functionName, message);
  return callback(null, response);
}

function existing(event, context, callback) {
  const functionName = 'existing';
  const response = { message: `Hello from S3! - (${functionName})`, event };
  const message = [
    event.Records[0].eventSource,
    event.Records[0].eventName,
    ' ',
    response.message,
  ].join('');
  log(functionName, message);
  return callback(null, response);
}

function existingCreated(event, context, callback) {
  const functionName = 'existingCreated';
  const response = { message: `Hello from S3! - (${functionName})`, event };
  const message = [
    event.Records[0].eventSource,
    event.Records[0].eventName,
    ' ',
    response.message,
  ].join('');
  log(functionName, message);
  return callback(null, response);
}

function existingRemoved(event, context, callback) {
  const functionName = 'existingRemoved';
  const response = { message: `Hello from S3! - (${functionName})`, event };
  const message = [
    event.Records[0].eventSource,
    event.Records[0].eventName,
    ' ',
    response.message,
  ].join('');
  log(functionName, message);
  return callback(null, response);
}

module.exports = { minimal, extended, existing, existingCreated, existingRemoved, custom };
