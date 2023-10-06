'use strict';

const open = require('open');
const { log, style } = require('@serverless/utils/log');
const configUtils = require('@serverless/utils/config');
const { ServerlessSDK } = require('@serverless/platform-client');

module.exports = async () => {
  log.notice('Logging into the Serverless Framework via the browser');

  const sdk = new ServerlessSDK();

  const { loginUrl, loginData: loginDataDeferred } = await sdk.login();

  open(loginUrl);
  log.notice(
    style.aside('If your browser does not open automatically, please open this URL:', loginUrl)
  );

  const loginData = await loginDataDeferred;

  // In `.serverlessrc`, we want to use `user_uid` as `userId` if possible
  const userId = loginData.user_uid || loginData.id;

  const loginDataToSaveInConfig = {
    userId,
    users: {
      [userId]: {
        userId,
        name: loginData.name,
        email: loginData.email,
        username: loginData.username,
        dashboard: {
          refreshToken: loginData.refreshToken,
          accessToken: loginData.accessToken,
          idToken: loginData.idToken,
          expiresAt: loginData.expiresAt,
          username: loginData.username,
        },
      },
    },
  };

  // save the login data in the rc file
  configUtils.set(loginDataToSaveInConfig);

  log.notice();
  log.notice.success('You are now logged into the Serverless Framework');
};
