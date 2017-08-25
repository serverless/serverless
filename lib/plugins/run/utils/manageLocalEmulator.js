'use strict';

const BbPromise = require('bluebird');
const childProcess = BbPromise.promisifyAll(require('child_process'));

const getLocalRootUrl = require('./getLocalRootUrl');
const deployFunctionsToLocalEmulator = require('./deployFunctionsToLocalEmulator');
const logServerless = require('./logServerless');
const logLocalEmulator = require('./logLocalEmulator');

function manageLocalEmulator(service, servicePath, options) {
  let initialized = false;
  const port = options.port;
  const debug = options.debug;
  let params = ['--port', port];
  if (debug) {
    params = params.concat(['--debug']);
    logServerless('Emulator initializing in debug mode...');
  } else {
    logServerless('Emulator initializing...');
  }
  const cp = childProcess.spawn('sle', params);

  return new BbPromise((resolve, reject) => {
    cp.stdout.on('data', stdout => {
      logLocalEmulator(stdout.toString('utf8'));
      if (!initialized) {
        initialized = true;
        return deployFunctionsToLocalEmulator(service, servicePath,
          getLocalRootUrl(port)).then(() => resolve());
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
