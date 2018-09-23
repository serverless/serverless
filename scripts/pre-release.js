'use strict';

const path = require('path');
const writeFile = require('../lib/utils/fs/writeFile');
const getTrackingConfigFileName = require('../lib/utils/getTrackingConfigFileName');

const trackingConfigFilePath = path.join(process.cwd(), getTrackingConfigFileName());

// don't release without Sentry key!
if (!process.env.SENTRY_DSN) {
  throw new Error('SENTRY_DSN env var not set');
}

const trackingConfig = {
  sentryDSN: process.env.SENTRY_DSN,
};

(() => writeFile(trackingConfigFilePath, trackingConfig))();
