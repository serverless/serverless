'use strict';

const configUtils = require('./config');

function getFrameworkId() {
  const config = configUtils.getGlobalConfig('getFrameworkId');
  return config.frameworkId;
}

module.exports = getFrameworkId;
