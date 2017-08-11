'use strict';

const BbPromise = require('bluebird');
const childProcess = BbPromise.promisifyAll(require('child_process'));

const getLocalRootUrl = require('./getLocalRootUrl');
const deployFunctionsToLocalEmulator = require('./deployFunctionsToLocalEmulator');
const logServerless = require('./logServerless');
const logLocalEmulator = require('./logLocalEmulator');

function manageLocalEmulator(service, servicePath, localEmulatorPort) {
  let initialized = false;
  logServerless('Spinning Up the Local Emulator');
  const cp = childProcess.spawn('sle',
    ['--port', localEmulatorPort]);

  cp.stdout.on('data', stdout => {
    logLocalEmulator(stdout.toString('utf8'));
    if (!initialized) {
      initialized = true;
      return deployFunctionsToLocalEmulator(service, servicePath,
        getLocalRootUrl(localEmulatorPort));
    }
    return BbPromise.resolve();
  });

  cp.stderr.on('data', stderr => {
    this.logLocalEmulator(stderr.toString('utf8'));
  });

  cp.on('close', () => BbPromise.resolve());
  cp.on('error', error => BbPromise.reject(error));

  process.on('exit', () => cp.kill());
}

module.exports = manageLocalEmulator;
