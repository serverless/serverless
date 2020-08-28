#!/usr/bin/env node

'use strict';

require('essentials');

// global graceful-fs patch
// https://github.com/isaacs/node-graceful-fs#global-patching
require('graceful-fs').gracefulify(require('fs'));

if (require('../lib/utils/tabCompletion/isSupported') && process.argv[2] === 'completion') {
  require('../lib/utils/autocomplete')();
  return;
}

const BbPromise = require('bluebird');
const logError = require('../lib/classes/Error').logError;
const uuid = require('uuid');

const invocationId = uuid.v4();

let serverless;

process.on('uncaughtException', error => logError(error, { forceExit: true, serverless }));

if (process.env.SLS_DEBUG) {
  // For performance reasons enabled only in SLS_DEBUG mode
  BbPromise.config({
    longStackTraces: true,
  });
}

const Serverless = require('../lib/Serverless');

serverless = new Serverless();

let resolveOnExitPromise;
serverless.onExitPromise = new Promise(resolve => (resolveOnExitPromise = resolve));
serverless.invocationId = invocationId;

require('../lib/utils/analytics').sendPending({
  serverlessExecutionSpan: serverless.onExitPromise,
});

serverless
  .init()
  .then(() => {
    if (serverless.invokedInstance) serverless = serverless.invokedInstance;
  })
  .then(() => serverless.run())
  .then(
    () => resolveOnExitPromise(),
    err => {
      resolveOnExitPromise();
      // If Enterprise Plugin, capture error
      let enterpriseErrorHandler = null;
      serverless.pluginManager.plugins.forEach(p => {
        if (p.enterprise && p.enterprise.errorHandler) {
          enterpriseErrorHandler = p.enterprise.errorHandler;
        }
      });
      if (!enterpriseErrorHandler) {
        logError(err, { serverless });
        return null;
      }
      return enterpriseErrorHandler(err, invocationId)
        .catch(error => {
          process.stdout.write(`${error.stack}\n`);
        })
        .then(() => {
          logError(err, { serverless });
        });
    }
  );
