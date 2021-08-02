'use strict';

const chalk = require('chalk');

const processBackendNotificationRequest = require('@serverless/utils/process-backend-notification-request');

const renderUpdateNotification = (notification) => {
  const messageLines = notification.message.split('\n');

  const prefix = 'Serverless: ';
  const borderLength =
    Math.min(
      prefix.length + messageLines.reduce((maxLength, line) => Math.max(maxLength, line.length), 0),
      process.stdout.columns
    ) || 10;
  const followingLinesPrefix = ' '.repeat(prefix.length);
  for (let i = 1; i < messageLines.length; ++i) {
    messageLines[i] = followingLinesPrefix + messageLines[i];
  }
  process.stdout.write(
    `\n${'*'.repeat(borderLength)}\n${prefix}${chalk.yellow(messageLines.join('\n'))}\n${'*'.repeat(
      borderLength
    )}\n`
  );
};

const renderPromotionalNotification = (notification) => {
  process.stdout.write(`\n${chalk.gray(notification.message)}\n`);
};

module.exports = (notifications) => {
  const { promotional, update } = processBackendNotificationRequest(notifications);
  if (promotional) {
    renderPromotionalNotification(promotional);
  }

  if (update) {
    renderUpdateNotification(update);
  }

  if (update || promotional) {
    process.stdout.write('\n');
  }
};
