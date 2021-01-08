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

const handleError = require('../lib/cli/handle-error');

let serverless;

process.once('uncaughtException', (error) =>
  handleError(error, {
    isUncaughtException: true,
    isLocallyInstalled: serverless && serverless.isLocallyInstalled,
  })
);

const processSpanPromise = (async () => {
  try {
    const wait = require('timers-ext/promise/sleep');
    await wait(); // Ensure access to "processSpanPromise"
    require('../lib/utils/analytics').sendPending({
      serverlessExecutionSpan: processSpanPromise,
    });

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

    try {
      serverless.onExitPromise = processSpanPromise;
      serverless.invocationId = invocationId;
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
      if (!enterpriseErrorHandler) throw error;
      try {
        await enterpriseErrorHandler(error, invocationId);
      } catch (enterpriseErrorHandlerError) {
        process.stdout.write(`${enterpriseErrorHandlerError.stack}\n`);
      }
      throw error;
    }
  } catch (error) {
    handleError(error);
  }
})();
