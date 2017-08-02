'use strict';

const BbPromise = require('bluebird');
const childProcess = BbPromise.promisifyAll(require('child_process'));

function localEmulatorInsatlled() {
  const stdout = childProcess.execSync('npm list -g serverless-local-emulator');
  const stdoutString = new Buffer(stdout, 'base64').toString();
  return stdoutString.includes('serverless-local-emulator');
}

module.exports = localEmulatorInsatlled;
