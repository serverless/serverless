'use strict';

const BbPromise = require('bluebird');
const childProcess = BbPromise.promisifyAll(require('child_process'));
const path = require('path');
const os = require('os');

const logServerless = require('./logServerless');
const logEventGateway = require('./logEventGateway');
const getTmpDirPath = require('./getTmpDirPath');
const getLocalRootUrl = require('./getLocalRootUrl');
const registerFunctionsToEventGateway = require('./registerFunctionsToEventGateway');

function manageEventGateway(service,
                            eventsPort,
                            configurationPort,
                            localEmulatorPort) {
  let initialized = false;
  const binaryFilePath = path
    .join(os.homedir(), '.serverless', 'event-gateway', 'event-gateway');
  logServerless('Spinning Up the Event Gateway');

  const args = [
    `--embed-data-dir=${getTmpDirPath()}`,
    '-log-level=debug',
    '--dev',
    '--log-format=json',
    `-config-port=${configurationPort}`,
    `-events-port=${eventsPort}`,
  ];

  const cp = childProcess
    .spawn(binaryFilePath, args);

  cp.stdout.on('data', stdout => {
    logEventGateway(stdout.toString('utf8'));
  });

  cp.stderr.on('data', stderr => {
    logEventGateway(stderr.toString('utf8'));
    if (!initialized) {
      initialized = true;
      setTimeout(() => registerFunctionsToEventGateway(service,
        getLocalRootUrl(eventsPort),
        getLocalRootUrl(configurationPort),
        getLocalRootUrl(localEmulatorPort)), 2000);
    }
  });

  cp.on('close', () => BbPromise.resolve());
  cp.on('error', error => BbPromise.reject(error));

  process.on('exit', () => cp.kill());
}

module.exports = manageEventGateway;
