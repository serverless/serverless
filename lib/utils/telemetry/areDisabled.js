'use strict';

const configUtils = require('@serverless/utils/config');

module.exports = Boolean(
  process.env.SLS_TELEMETRY_DISABLED ||
    process.env.SLS_TRACKING_DISABLED ||
    configUtils.get('trackingDisabled')
);
