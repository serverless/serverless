'use strict';

const configUtils = require('./config');

function isLoggedIn() {
  const config = configUtils.getConfig();
  const currentId = config.userId;
  const globalConfig = configUtils.getGlobalConfig();
  if (globalConfig
    && globalConfig.users
    && globalConfig.users[currentId]
    && globalConfig.users[currentId].dashboard
    && globalConfig.users[currentId].dashboard.idToken) {
    return true;
  }
  return false;
}

module.exports = isLoggedIn;
