'use strict';

const configUtils = require('./config');
const platform = require('@serverless/platform-sdk');
const BbPromise = require('bluebird');

function getUser() {
  const userConfig = configUtils.getConfig();
  const currentId = userConfig.userId;
  const globalConfig = configUtils.getGlobalConfig();
  let user = null;
  if (globalConfig
    && globalConfig.users
    && globalConfig.users[currentId]
    && globalConfig.users[currentId].dashboard) {
    user = globalConfig.users[currentId].dashboard;
  }
  if (!user || !user.username || !user.idToken) { // user logged out
    return BbPromise.resolve(null);
  }

  if (Number(user.expiresAt) - 43200000 < (new Date()).getTime()) {
    return platform.refreshToken(user.refreshToken).then(tokens => {
      const expiresAt = tokens.expires_in * 1000 + new Date().getTime(); // eslint-disable-line
      globalConfig.users[currentId].dashboard.idToken = tokens.id_token;
      globalConfig.users[currentId].dashboard.accessToken = tokens.access_token;
      globalConfig.users[currentId].dashboard.expiresAt = expiresAt;
      configUtils.set(globalConfig);
      return BbPromise.resolve({ idToken: tokens.id_token, username: user.username });
    });
  }

  return BbPromise.resolve({ idToken: user.idToken, username: user.username });
}

module.exports = getUser;
