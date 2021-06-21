'use strict';

const fs = require('fs');

// Temporary patch to help tackle peekaboo error, by revelaing fuller stack trace for "fs" errors
// https://github.com/serverless/serverless/runs/1740873363
const patchPromised = (name) => {
  const original = fs.promises[name];
  fs.promises[name] = Object.defineProperties(
    function (...args) {
      const stack = new Error().stack;
      return original.apply(this, args).catch((error) => {
        error.message += ` (initiated at: ${stack}\n)`;
        throw error;
      });
    },
    {
      length: { value: original.length },
      name: { value: original.name },
    }
  );
};
const patchCallback = (name) => {
  const original = fs[name];
  fs[name] = Object.defineProperties(
    function (...args) {
      const stack = new Error().stack;
      const callback = args[args.length - 1];
      original.call(this, ...args.slice(0, -1), (error, ...result) => {
        if (error) error.message += ` (initiated at: ${stack}\n)`;
        return callback.call(this, error, ...result);
      });
    },
    {
      length: { value: original.length },
      name: { value: original.name },
    }
  );
};
patchPromised('readFile');
patchPromised('open');
patchCallback('readFile');
patchCallback('open');

const ensureArtifact = require('../lib/utils/ensureArtifact');
const resolveLocalServerless = require('../lib/cli/resolve-local-serverless-path');
const resolveInput = require('../lib/cli/resolve-input');

const BbPromise = require('bluebird');

BbPromise.config({
  longStackTraces: true,
});

const { runnerEmitter } = require('@serverless/test/setup/patch');

runnerEmitter.on('runner', (runner) => {
  runner.on('suite end', (suite) => {
    if (!suite.parent || !suite.parent.root) return;

    resolveInput.clear();
    // Ensure to reset cache for local serverless installation resolution
    // Leaking it across test files may introduce wrong assumptions when result is used for testing
    resolveLocalServerless.clear();
    // Ensure to reset memoization on artifacts generation after each test file run.
    // Reason is that homedir is automatically cleaned for each test,
    // therefore eventually built custom resource file is also removed
    ensureArtifact.clear();
  });
});
