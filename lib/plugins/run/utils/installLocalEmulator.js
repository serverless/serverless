'use strict';

const BbPromise = require('bluebird');
const childProcess = BbPromise.promisifyAll(require('child_process'));

function installLocalEmulator(localEmulatorVersion) {
  childProcess.execSync(`npm install -g @serverless/emulator@${localEmulatorVersion}`);
}

module.exports = installLocalEmulator;
