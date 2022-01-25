'use strict';

const { log, style } = require('@serverless/utils/log');

const processBackendNotificationRequest = require('@serverless/utils/process-backend-notification-request');

module.exports = (notifications) => {
  const notification = processBackendNotificationRequest(notifications);
  if (!notification) return;

  log.notice();
  log.notice(style.aside(notification.message));
};
