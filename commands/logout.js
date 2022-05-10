'use strict';

const _ = require('lodash');
const { log } = require('@serverless/utils/log');
const accountUtils = require('@serverless/utils/account');
const configUtils = require('@serverless/utils/config');

module.exports = async ({ configuration }) => {
  const user = configUtils.getLoggedInUser();

  if (!user) {
    log.notice.skip('You are already logged out');
    return;
  }

  accountUtils.logout();
  const isConsole = Boolean(_.get(configuration, 'console'));
  log.notice.success(
    `You are now logged out of the Serverless ${isConsole ? 'Console' : 'Dashboard'}`
  );
};
