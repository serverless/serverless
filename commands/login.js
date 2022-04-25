'use strict';

const _ = require('lodash');
const open = require('open');
const { log, style } = require('@serverless/utils/log');
const configUtils = require('@serverless/utils/config');
const { ServerlessSDK } = require('@serverless/platform-client');

module.exports = async ({ configuration, options }) => {
  const isConsole = Boolean(_.get(configuration, 'console'));
  log.notice(`Logging into the Serverless ${isConsole ? 'Console' : 'Dashboard'} via the browser`);

  const sdk = new ServerlessSDK();

  const loginOptions = {};
  if (isConsole) loginOptions.app = 'console';

  const { loginUrl, loginData: loginDataDeferred } = await sdk.login(loginOptions);

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
  log.notice.success(
    `You are now logged into the Serverless ${isConsole ? 'Console' : 'Dashboard'}`
  );

  if (isConsole) {
    log.notice();
    log.notice('Learn more at https://www.serverless.com/console/docs');
    return;
  }
  if (!_.get(configuration, 'org', options.org) || !_.get(configuration, 'app', options.app)) {
    log.notice();
    log.notice('Run "serverless" to add your service to the Serverless Dashboard');
  }
};
