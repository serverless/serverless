#!/usr/bin/env node

'use strict';

require('essentials');

const nodeVersion = Number(process.version.split('.')[0].slice(1));

if (nodeVersion < 10) {
  const serverlessVersion = Number(require('../package.json').version.split('.')[0]);
  process.stdout.write(
    `Serverless: \x1b[91mInitialization error: Node.js v${nodeVersion} is not supported by ` +
      `Serverless Framework v${serverlessVersion}. Please upgrade\x1b[39m\n`
  );
  process.exit(1);
}

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

process.on('uncaughtException', error => logError(error, { forceExit: true }));

if (process.env.SLS_DEBUG) {
  // For performance reasons enabled only in SLS_DEBUG mode
  BbPromise.config({
    longStackTraces: true,
  });
}

let resolveServerlessExecutionSpan;
require('../lib/utils/analytics').sendPending({
  serverlessExecutionSpan: new BbPromise(resolve => (resolveServerlessExecutionSpan = resolve)),
});

// requiring here so that if anything went wrong,
// during require, it will be caught.
const Serverless = require('../lib/Serverless');

const serverless = new Serverless();

serverless.invocationId = invocationId;

serverless
  .init()
  .then(() => serverless.run())
  .then(
    () => resolveServerlessExecutionSpan(),
    err => {
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
    }
  );
