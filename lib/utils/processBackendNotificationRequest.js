'use strict';

const chalk = require('chalk');

const processBackendNotificationRequest = require('@serverless/utils/process-backend-notification-request');

module.exports = notifications => {
  const notification = processBackendNotificationRequest(notifications);
  if (!notification) return;

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
    )}\n\n`
  );
};
