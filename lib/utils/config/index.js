'use strict';

/* Config util */
const path = require('path');
const os = require('os');
const _ = require('lodash');
const writeFileAtomic = require('write-file-atomic');
const getFrameworkId = require('../getFrameworkId');
const fileExistsSync = require('../fs/fileExistsSync');
const readFileSync = require('../fs/readFileSync');
const isTrackingDisabled = require('../isTrackingDisabled');

const globalConfigPath = path.join(os.homedir(), '.serverlessrc');

function createConfig() {
  // set default config options
  const config = {
    userId: null, // currentUserId
    frameworkId: getFrameworkId(),
    trackingDisabled: isTrackingDisabled(),
    meta: {
      created_at: Math.round(+new Date() / 1000),
      updated_at: null,
    }
  };
  writeFileAtomic.sync(globalConfigPath, JSON.stringify(config, null, 2));
  return JSON.parse(readFileSync(globalConfigPath));
}

function getGlobalConfig() {
  if (!fileExistsSync(globalConfigPath)) {
    return createConfig();
  }
  const config = readFileSync(globalConfigPath);
  // if global config empty add defaults
  if (!config) {
    return createConfig();
  }
  return JSON.parse(config);
}

// get .serverlessrc config + local config if exists
function getConfig() {
  if (!fileExistsSync(globalConfigPath)) {
    return createConfig();
  }
  return require('rc')('serverless'); // eslint-disable-line
}

// set global .serverlessrc config value.
function setConfigValue(key, value) {
  let config = getGlobalConfig();
  if (key && typeof key === 'string' && typeof value !== 'undefined') {
    config = _.set(config, key, value);
  } else if (_.isObject(key)) {
    config = _.merge(config, key);
  } else if (typeof value !== 'undefined') {
    config = _.merge(config, value);
  }
  config.meta.updated_at = Math.round(+new Date() / 1000);
  // write file
  writeFileAtomic.sync(globalConfigPath, JSON.stringify(config, null, 2));
  return config;
}

function deleteConfigValue(key) {
  let config = getGlobalConfig();
  if (key && typeof key === 'string') {
    config = _.omit(config, [key]);
  } else if (key && _.isArray(key)) {
    config = _.omit(config, key);
  }
  // write file
  writeFileAtomic.sync(globalConfigPath, JSON.stringify(config, null, 2));
  return config;
}

// set local config value /project/.serverlessrc
// function setLocalConfig() {}

// set .serverlessrc config value
function getConfigValue(objectPath) {
  const config = getConfig();
  if (objectPath && typeof objectPath === 'string') {
    return _.get(config, objectPath);
  }
  return config;
}

module.exports = {
  set: setConfigValue,
  get: getConfigValue,
  delete: deleteConfigValue,
  getConfig,
  getGlobalConfig,
  CONFIG_FILE_PATH: globalConfigPath,
};
