'use strict';

const BbPromise = require('bluebird');
const childProcess = BbPromise.promisifyAll(require('child_process'));
const path = require('path');
const os = require('os');
const _ = require('lodash');

const logServerless = require('./logServerless');
const logEventGateway = require('./logEventGateway');
const getTmpDirPath = require('./getTmpDirPath');
const getLocalRootUrl = require('./getLocalRootUrl');
const registerFunctionsToEventGateway = require('./registerFunctionsToEventGateway');

const splitLinesAndLog = data => {
  const str = data.toString('utf8');
  // TODO makes sure this doesn't affect escaped newlines inside event content
  const lines = str.split(/\r?\n/g);
  _.forEach(lines, line => {
    if (line !== '') {
      logEventGateway(line);
    }
  });
};

function manageEventGateway(service, eventsPort, configurationPort, localEmulatorPort) {
  let initialized = false;
  const binaryFilePath = path.join(os.homedir(), '.serverless', 'event-gateway', 'event-gateway');
  logServerless('Event Gateway initializing...');

  const args = [
    `-embed-data-dir=${getTmpDirPath()}`,
    '-dev',
    '-log-level=debug',
    '-log-format=json',
    `-config-port=${configurationPort}`,
    `-events-port=${eventsPort}`,
  ];

  const cp = childProcess.spawn(binaryFilePath, args);

  cp.stdout.on('data', stdout => {
    splitLinesAndLog(stdout);
  });

  cp.stderr.on('data', stderr => {
    splitLinesAndLog(stderr);

    if (!initialized) {
      initialized = true;
      logServerless('Event Gateway initialized');
      setTimeout(
        () =>
          registerFunctionsToEventGateway(
            service,
            getLocalRootUrl(eventsPort),
            getLocalRootUrl(configurationPort),
            getLocalRootUrl(localEmulatorPort)
          ),
        2000
      );
    }
  });

  cp.on('close', () => BbPromise.resolve());
  cp.on('error', error => BbPromise.reject(error));

  process.on('exit', () => cp.kill());
}

module.exports = manageEventGateway;
