'use strict';

const BbPromise = require('bluebird');
const childProcess = BbPromise.promisifyAll(require('child_process'));

const getLocalRootUrl = require('./getLocalRootUrl');
const deployFunctionsToLocalEmulator = require('./deployFunctionsToLocalEmulator');
const logServerless = require('./logServerless');
const logLocalEmulator = require('./logLocalEmulator');

function manageLocalEmulator(service, servicePath, options) {
  let initialized = false;
  const { port, debug } = options;
  let params = ['--port', port];
  if (debug) {
    params = params.concat(['--debug']);
    logServerless('Initializing Local Emulator in debug mode...');
  } else {
    logServerless('Initializing Local Emulator...');
  }
  const cp = childProcess.spawn('sle', params);

  return new BbPromise((resolve, reject) => {
    cp.stdout.on('data', stdout => {
      logLocalEmulator(stdout.toString('utf8'));
      if (!initialized) {
        initialized = true;
        return deployFunctionsToLocalEmulator(service, servicePath,
          getLocalRootUrl(port));
      }
      return resolve();
    });

    cp.stderr.on('data', stderr => {
      logLocalEmulator(stderr.toString('utf8'));
    });

    cp.on('close', () => resolve());
    cp.on('error', error => reject(error));

    process.on('exit', () => cp.kill());
  });
}

module.exports = manageLocalEmulator;
