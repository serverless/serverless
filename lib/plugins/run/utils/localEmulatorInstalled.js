'use strict';

// const BbPromise = require('bluebird');
// const childProcess = BbPromise.promisifyAll(require('child_process'));
//
// function localEmulatorInsatlled() {
//   const stdout = childProcess.execSync('npm list -g serverless-local-emulator');
//   const stdoutString = new Buffer(stdout, 'base64').toString();
//   return stdoutString.includes('serverless-local-emulator');
// }
//
// module.exports = localEmulatorInsatlled;

const path = require('path');
const os = require('os');
const fileExistsSync = require('../../../utils/fs/fileExistsSync');

function localEmulatorInstalled() {
  const localEmulatorPackageJsonFilePath = path
    .join(os.homedir(), 'node_modules', 'serverless-local-emulator', 'package.json');
  return fileExistsSync(localEmulatorPackageJsonFilePath);
}

module.exports = localEmulatorInstalled;
