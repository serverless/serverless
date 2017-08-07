'use strict';

const BbPromise = require('bluebird');
const childProcess = BbPromise.promisifyAll(require('child_process'));

function installLocalEmulator() {
  childProcess.execSync('npm install -g @serverless/emulator');
}

module.exports = installLocalEmulator;
