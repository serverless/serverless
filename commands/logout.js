'use strict';

const { log } = require('@serverless/utils/log');
const accountUtils = require('@serverless/utils/account');
const configUtils = require('@serverless/utils/config');

module.exports = async () => {
  const user = configUtils.getLoggedInUser();
  if (!user) {
    log.notice.skip('You are already logged out');
    return;
  }

  accountUtils.logout();
  log.notice.success('You are now logged out of the Serverless Framework');
};
