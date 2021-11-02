'use strict';

const chalk = require('chalk');
const { legacy, log, style } = require('@serverless/utils/log');

const processBackendNotificationRequest = require('@serverless/utils/process-backend-notification-request');

module.exports = (notifications) => {
  const notification = processBackendNotificationRequest(notifications);
  if (!notification) return;

  legacy.write(`\n${chalk.gray(notification.message)}\n`);
  log.notice();
  log.notice(style.aside(notification.message));
};
