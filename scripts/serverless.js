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

const logError = require('../lib/classes/Error').logError;

let serverless;

process.on('uncaughtException', (error) => logError(error, { forceExit: true, serverless }));

const BbPromise = require('bluebird');
const uuid = require('uuid');

const invocationId = uuid.v4();
if (process.env.SLS_DEBUG) {
  // For performance reasons enabled only in SLS_DEBUG mode
  BbPromise.config({
    longStackTraces: true,
  });
}

const Serverless = require('../lib/Serverless');

serverless = new Serverless();

let resolveOnExitPromise;
serverless.onExitPromise = new Promise((resolve) => (resolveOnExitPromise = resolve));
serverless.invocationId = invocationId;

require('../lib/utils/analytics').sendPending({
  serverlessExecutionSpan: serverless.onExitPromise,
});

(async () => {
  try {
    await serverless.init();
    if (serverless.invokedInstance) serverless = serverless.invokedInstance;
    await serverless.run();
  } catch (error) {
    // If Enterprise Plugin, capture error
    let enterpriseErrorHandler = null;
    serverless.pluginManager.plugins.forEach((p) => {
      if (p.enterprise && p.enterprise.errorHandler) {
        enterpriseErrorHandler = p.enterprise.errorHandler;
      }
    });
    if (!enterpriseErrorHandler) {
      logError(error, { serverless });
      return;
    }
    try {
      await enterpriseErrorHandler(error, invocationId);
    } catch (enterpriseErrorHandlerError) {
      process.stdout.write(`${enterpriseErrorHandlerError.stack}\n`);
    }
    logError(error, { serverless });
  } finally {
    resolveOnExitPromise();
  }
})();
