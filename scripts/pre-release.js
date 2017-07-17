'use strict';

const writeFile = require('../lib/utils/fs/writeFile');
const getTrackingConfigFileName = require('../lib/utils/getTrackingConfigFileName');
const path = require('path');

const trackingConfigFilePath = path.join(process.cwd(), getTrackingConfigFileName());

// don't release without tracking keys!
if (!process.env.SEGMENT_WRITE_KEY) {
  throw new Error('SEGMENT_WRITE_KEY env var not set');
} else if (!process.env.SENTRY_DSN) {
  throw new Error('SENTRY_DSN env var not set');
}

const trackingConfig = {
  segmentWriteKey: process.env.SEGMENT_WRITE_KEY,
  sentryDSN: process.env.SENTRY_DSN,
};

(() => writeFile(trackingConfigFilePath, trackingConfig))();
