'use strict';

const configUtils = require('./config');

function getAuthToken() {
  if (process.env.SERVERLESS_TOKEN) {
    return process.env.SERVERLESS_TOKEN;
  }

  const userConfig = configUtils.getConfig();
  const currentId = userConfig.userId;
  const globalConfig = configUtils.getGlobalConfig();
  if (globalConfig.users && globalConfig.users[currentId] && globalConfig.users[currentId].auth) {
    return globalConfig.users[currentId].auth.id_token;
  }
  return null;
}

module.exports = getAuthToken;
