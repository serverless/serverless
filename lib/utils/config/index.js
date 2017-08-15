'use strict';

/* Config util */
const p = require('path');
const os = require('os');
const _ = require('lodash');
const writeFileAtomic = require('write-file-atomic');
const fileExistsSync = require('../fs/fileExistsSync');
const readFileSync = require('../fs/readFileSync');
const initialSetup = require('./initialSetup');

const serverlessrcPath = p.join(os.homedir(), '.serverlessrc');

function createConfig() {
  // set default config options
  const config = {
    userId: null, // currentUserId
    frameworkId: initialSetup.generateFrameworkId(),
    trackingDisabled: initialSetup.configureTrack(), // default false
    meta: {
      created_at: Math.round(+new Date() / 1000), // config file creation date
      updated_at: null,  // config file updated date
    },
  };

  // remove legacy files
  initialSetup.removeLegacyFrameworkIdFiles();

  // save new config
  writeFileAtomic.sync(serverlessrcPath, JSON.stringify(config, null, 2));
  return JSON.parse(readFileSync(serverlessrcPath));
}

// check for global .serverlessrc file
function hasConfigFile() {
  return fileExistsSync(serverlessrcPath);
}

// get global + local .serverlessrc config
// 'rc' module merges local config over global
function getConfig() {
  if (!hasConfigFile()) {
    // create config first
    createConfig();
  }
  // then return config merged via rc module
  return require('rc')('serverless'); // eslint-disable-line
}

function getGlobalConfig() {
  if (hasConfigFile()) {
    return JSON.parse(readFileSync(serverlessrcPath));
  }
  // else create and return it
  return createConfig();
}

// set global .serverlessrc config value.
function set(key, value) {
  let config = getGlobalConfig();
  if (key && typeof key === 'string' && typeof value !== 'undefined') {
    config = _.set(config, key, value);
  } else if (_.isObject(key)) {
    config = _.merge(config, key);
  } else if (typeof value !== 'undefined') {
    config = _.merge(config, value);
  }
  // update config meta
  config.meta = config.meta || {};
  config.meta.updated_at = Math.round(+new Date() / 1000);
  // write to .serverlessrc file
  writeFileAtomic.sync(serverlessrcPath, JSON.stringify(config, null, 2));
  return config;
}

function deleteValue(key) {
  let config = getGlobalConfig();
  if (key && typeof key === 'string') {
    config = _.omit(config, [key]);
  } else if (key && _.isArray(key)) {
    config = _.omit(config, key);
  }
  // write to .serverlessrc file
  writeFileAtomic.sync(serverlessrcPath, JSON.stringify(config, null, 2));
  return config;
}

/* Get config value with object path */
function get(path) {
  const config = getConfig();
  return _.get(config, path);
}

module.exports = {
  set: set, // eslint-disable-line
  get: get, // eslint-disable-line
  delete: deleteValue,
  getConfig: getConfig, // eslint-disable-line
  getGlobalConfig: getGlobalConfig, // eslint-disable-line
  CONFIG_FILE_PATH: serverlessrcPath,
};
