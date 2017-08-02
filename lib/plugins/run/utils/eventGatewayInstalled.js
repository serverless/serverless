'use strict';

const path = require('path');
const os = require('os');
const fileExistsSync = require('../../../utils/fs/fileExistsSync');

function eventGatewayInstalled() {
  const eventGatewayBinaryFilePath = path
    .join(os.homedir(), '.serverless', 'event-gateway', 'event-gateway');
  return fileExistsSync(eventGatewayBinaryFilePath);
}

module.exports = eventGatewayInstalled;
