'use strict';

/* eslint-disable no-console */

/**
 * Validate Event names to keep data clean
 */
const chalk = require('chalk');

const VALID_TRACKING_PROJECTS = ['framework'];
const VALID_TRACKING_OBJECTS = ['user', 'service'];

function containsSeparators(eventName) {
  const underscores = (eventName.match(/_/g) || []).length;
  const colons = (eventName.match(/:/g) || []).length;
  if (underscores !== 1) {
    console.log(chalk.red('Tracking Error:'));
    console.log(
      chalk.red(`Event name must have single underscore. "${eventName}" contains ${underscores}`)
    );
    return false;
  }
  if (colons !== 1) {
    console.log(chalk.red('Tracking Error:'));
    console.log(chalk.red(`Event name must have single colon. "${eventName}" contains ${colons}`));
    return false;
  }
  return true;
}

// Validate tracking project for clean events
function isValidProject(project) {
  const isValid = VALID_TRACKING_PROJECTS.indexOf(project) !== -1;
  if (!isValid) {
    console.log(chalk.red('Tracking Error:'));
    console.log(`"${project}" is invalid project. Must be one of`, VALID_TRACKING_PROJECTS);
  }
  return isValid;
}

// Validate tracking objects for clean events
function isValidObject(key) {
  const isValid = VALID_TRACKING_OBJECTS.indexOf(key) !== -1;
  if (!isValid) {
    console.log(chalk.red('Tracking Error:'));
    console.log(`"${key}" is invalid tracking object. Must be one of`, VALID_TRACKING_OBJECTS);
  }
  return isValid;
}

function formattingWarning(eventName) {
  console.log(chalk.red(`Incorrect tracking event format: "${eventName}"`));
  console.log(`Tracking event must match ${chalk.yellow('product:objectName_actionName')}`);
  console.log(`It must be all camelCase: ${chalk.yellow('camelCase:camelCase_camelCase')}`);
  console.log(`Here is an Example ${chalk.green('framework:user_loggedIn')}`);
  console.log('Note: "framework:" is automatically prepended');
  console.log(`Usage: ${chalk.yellow('track("user_loggedIn", { ..extraData });')}`);
  console.log('-----------------------------');
  return false;
}

// validate events to naming conventions. clean data FTW!
module.exports = function isValidEventName(eventName) {
  // match framework:objectName_actionName
  const matches = eventName.match(/([a-zA-Z]*):([a-zA-Z]*)_(.*)/);
  if (!containsSeparators(eventName) || !matches) {
    return formattingWarning(eventName);
  }
  const project = matches[1];
  const object = matches[2];
  const action = matches[3];

  // if missing any parts of event, exit;
  if (!project || !object || !action) {
    return formattingWarning(eventName);
  }
  // validate project name
  if (!isValidProject(project)) {
    return formattingWarning(eventName);
  }
  // validate object name
  if (!isValidObject(object)) {
    return formattingWarning(eventName);
  }
  return true;
};
