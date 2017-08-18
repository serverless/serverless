'use strict';

const path = require('path');
const os = require('os');
const BbPromise = require('bluebird');
const childProcess = BbPromise.promisifyAll(require('child_process'));
const fileExistsSync = require('../../../utils/fs/fileExistsSync');

function eventGatewayInstalled(eventGatewayVersion) {
  const eventGatewayBinaryFilePath = path
    .join(os.homedir(), '.serverless', 'event-gateway', 'event-gateway');

  if (!fileExistsSync(eventGatewayBinaryFilePath)) {
    return false;
  }

  const cp = childProcess.spawnSync(eventGatewayBinaryFilePath, ['--version'],
    { encoding: 'utf8' });
  const currentVersion = cp.stdout.replace('Event Gateway version: ', '').trim();
  if (currentVersion !== eventGatewayVersion) {
    return false;
  }
  return true;
}

module.exports = eventGatewayInstalled;
