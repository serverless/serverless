'use strict';

const BbPromise = require('bluebird');
const childProcess = BbPromise.promisifyAll(require('child_process'));

function localEmulatorInstalled() {
  try {
    const stdout = childProcess.execSync('sle ping', { stdio: 'pipe' });
    const stdoutString = new Buffer(stdout, 'base64').toString();
    return stdoutString.includes('pong');
  } catch (e) {
    return false;
  }
}

module.exports = localEmulatorInstalled;
