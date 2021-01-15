'use strict';

const fs = require('fs');

const patchPromised = (name) => {
  const original = fs.promises[name];
  fs.promises[name] = Object.defineProperty(
    function patchFs(...args) {
      const stack = new Error().stack;
      return original.apply(this, args).catch((error) => {
        error.message += ` (initiated at: ${stack}\n)`;
        throw error;
      });
    },
    'length',
    {
      value: original.length,
    }
  );
};

const patchSync = (name) => {
  const original = fs[name];
  fs[name] = Object.defineProperty(
    function patchFs(...args) {
      const stack = new Error().stack;
      try {
        return original.apply(this, args);
      } catch (error) {
        error.message += ` (initiated at: ${stack}\n)`;
        throw error;
      }
    },
    'length',
    {
      value: original.length,
    }
  );
};

patchPromised('readFile');

patchSync('readFileSync');

const path = require('path');
const disableServerlessStatsRequests = require('@serverless/test/disable-serverless-stats-requests');
const ensureArtifact = require('../lib/utils/ensureArtifact');
const resolveLocalServerless = require('../lib/cli/resolve-local-serverless-path');

disableServerlessStatsRequests(path.resolve(__dirname, '..'));

const BbPromise = require('bluebird');

BbPromise.config({
  longStackTraces: true,
});

const { runnerEmitter } = require('@serverless/test/setup/patch');

runnerEmitter.on('runner', (runner) => {
  runner.on('suite end', (suite) => {
    if (!suite.parent || !suite.parent.root) return;

    // Ensure to reset cache for local serverless installation resolution
    // Leaking it across test files may introduce wrong assumptions when result is used for testing
    resolveLocalServerless.clear();
    // Ensure to reset memoization on artifacts generation after each test file run.
    // Reason is that homedir is automatically cleaned for each test,
    // therefore eventually built custom resource file is also removed
    ensureArtifact.clear();
  });
});
