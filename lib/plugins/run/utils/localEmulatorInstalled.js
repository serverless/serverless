'use strict';

const BbPromise = require('bluebird');
const childProcess = BbPromise.promisifyAll(require('child_process'));

function localEmulatorInstalled(localEmulatorVersion) {
  try {
    const cp = childProcess.spawnSync('sle', ['ping'], { encoding: 'utf8' });
    const currentVersion = cp.stdout.trim();
    if (currentVersion === 'pong' || (currentVersion !== localEmulatorVersion)) {
      return false;
    }
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = localEmulatorInstalled;
