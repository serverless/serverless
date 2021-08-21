'use strict';

const chalk = require('chalk');

const processBackendNotificationRequest = require('@serverless/utils/process-backend-notification-request');

module.exports = (notifications) => {
  const notification = processBackendNotificationRequest(notifications);
  if (!notification) return;

  process.stdout.write(`\n${chalk.gray(notification.message)}\n`);
};
