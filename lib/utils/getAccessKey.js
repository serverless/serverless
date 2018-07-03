'use strict';

const configUtils = require('./config');
const platform = require('@serverless/platform-sdk');
const BbPromise = require('bluebird');

function getAccessKey(tenant) {
  if (process.env.SERVERLESS_ACCESS_KEY) {
    return BbPromise.resolve(process.env.SERVERLESS_ACCESS_KEY);
  }
  if (!tenant) {
    return BbPromise.resolve(null);
  }
  const userConfig = configUtils.getConfig();
  const currentId = userConfig.userId;
  const globalConfig = configUtils.getGlobalConfig();
  if (globalConfig.users && globalConfig.users[currentId] &&
    globalConfig.users[currentId].dashboard) {
    if (globalConfig.users[currentId].dashboard.accessKey) {
      return BbPromise.resolve(globalConfig.users[currentId].dashboard.accessKey);
    } else if (globalConfig.users[currentId].dashboard.idToken) {
      const data = {
        tenant,
        username: globalConfig.users[currentId].username,
        idToken: globalConfig.users[currentId].dashboard.idToken,
        title: 'Framework',
      };
      return platform.createAccessKey(data).then(accessKey => {
        globalConfig.users[currentId].dashboard.accessKey = accessKey;
        configUtils.set(globalConfig);
        return accessKey;
      });
    }
  }
  return BbPromise.resolve(null);
}

module.exports = getAccessKey;
