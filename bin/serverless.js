#!/usr/bin/env node

'use strict';

const isStandaloneExecutable = require('../lib/utils/isStandaloneExecutable');

if (isStandaloneExecutable) {
  require('../lib/utils/standalone-patch');
  if (process.argv[2] === 'binary-postinstall' && process.argv.length === 3) {
    require('../scripts/postinstall');
    return;
  }
}

// global graceful-fs patch
// https://github.com/isaacs/node-graceful-fs#global-patching
const realFs = require('fs');
const gracefulFs = require('graceful-fs');

gracefulFs.gracefulify(realFs);

const userNodeVersion = Number(process.version.split('.')[0].slice(1));

// only check for components if user is running Node 8
if (userNodeVersion >= 8) {
  const componentsV1 = require('../lib/components-v1');
  const componentsV2 = require('../lib/components-v2');

  if (componentsV1 && componentsV1.runningComponents()) {
    componentsV1.runComponents();
    return;
  }

  if (componentsV2 && componentsV2.runningComponents()) {
    componentsV2.runComponents();
    return;
  }
}

require('essentials');

const autocomplete = require('../lib/utils/autocomplete');
const BbPromise = require('bluebird');
const logError = require('../lib/classes/Error').logError;
const uuid = require('uuid');
const initializeErrorReporter = require('../lib/utils/sentry').initializeErrorReporter;

if (process.env.SLS_DEBUG) {
  // For performance reasons enabled only in SLS_DEBUG mode
  BbPromise.config({
    longStackTraces: true,
  });
}

process.on('uncaughtException', error => logError(error, { forceExit: true }));

process.noDeprecation = true;

if (require('../lib/utils/tabCompletion/isSupported') && process.argv[2] === 'completion') {
  autocomplete();
  return;
}

let resolveServerlessExecutionSpan;
require('../lib/utils/tracking').sendPending({
  serverlessExecutionSpan: new BbPromise(resolve => (resolveServerlessExecutionSpan = resolve)),
});

const invocationId = uuid.v4();
initializeErrorReporter(invocationId)
  .then(() => {
    // requiring here so that if anything went wrong,
    // during require, it will be caught.
    const Serverless = require('../lib/Serverless');

    const serverless = new Serverless();

    serverless.invocationId = invocationId;

    return serverless
      .init()
      .then(() => serverless.run())
      .then(() => resolveServerlessExecutionSpan())
      .catch(err => {
        resolveServerlessExecutionSpan();
        // If Enterprise Plugin, capture error
        let enterpriseErrorHandler = null;
        serverless.pluginManager.plugins.forEach(p => {
          if (p.enterprise && p.enterprise.errorHandler) {
            enterpriseErrorHandler = p.enterprise.errorHandler;
          }
        });
        if (!enterpriseErrorHandler) {
          logError(err);
          return null;
        }
        return enterpriseErrorHandler(err, invocationId)
          .catch(error => {
            process.stdout.write(`${error.stack}\n`);
          })
          .then(() => {
            logError(err);
          });
      });
  })
  .catch(error => {
    resolveServerlessExecutionSpan();
    throw error;
  });
