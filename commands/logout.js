'use strict';

const { log } = require('@serverless/utils/log');
const accountUtils = require('@serverless/utils/account');
const configUtils = require('@serverless/utils/config');
const consoleLogout = require('@serverless/utils/auth/logout');

module.exports = async () => {
  const wasLoggedIntoConsole = consoleLogout();
  if (wasLoggedIntoConsole) {
    log.notice.success('You are now logged out of the Serverless Console');
  }

  const user = configUtils.getLoggedInUser();

  if (!user) {
    if (!wasLoggedIntoConsole) log.notice.skip('You are already logged out');
    return;
  }

  accountUtils.logout();
  log.notice.success('You are now logged out of the Serverless Dashboard');
};
