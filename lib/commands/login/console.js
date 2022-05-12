'use strict';

const { log, style } = require('@serverless/utils/log');
const login = require('@serverless/utils/auth/login');

module.exports = async () => {
  log.notice('Logging into the Serverless Console via the browser');
  await login({
    clientName: 'cli:serverless',
    clientVersion: require('../../../package').version,
    onLoginUrl: (loginUrl) => {
      log.notice(
        style.aside('If your browser does not open automatically, please open this URL:', loginUrl)
      );
    },
  });
  log.notice();
  log.notice.success("You are now logged into the Serverless Console'");
  log.notice();
  log.notice('Learn more at https://www.serverless.com/console/docs');
};
