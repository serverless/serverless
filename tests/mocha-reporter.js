'use strict';

// Unahdled rejections are not exposed in Mocha, enforce it
// https://github.com/mochajs/mocha/issues/2640
process.on('unhandledRejection', err => {
  throw err;
});

// Workaround Mocha v5 issue: https://github.com/mochajs/mocha/issues/3226
// Fixed in v6, but not really: https://github.com/mochajs/mocha/issues/3917
process.on('uncaughtException', err => {
  if (!process.listenerCount('exit')) return;
  // Mocha done it's report, and registered process.exit listener which silences any further
  // eventual crashes. Recover by unregistering the listener
  process.removeAllListeners('exit');
  throw err;
});

const Spec = require('mocha/lib/reporters/spec');
const Runner = require('mocha/lib/runner');

// Ensure faster tests propagation
// It's to expose errors otherwise hidden by race conditions
// Reported to Mocha with: https://github.com/mochajs/mocha/issues/3920
Runner.immediately = process.nextTick;

module.exports = class ServerlessSpec extends Spec {
  constructor(runner) {
    super(runner);
    runner.on('end', () =>
      setTimeout(() => {
        // If tests end with any orphaned async call then this callback will be invoked
        // It's a signal there's some promise chain (or in general async flow) miconfiguration
        throw new Error('Test ended with unfinished async jobs');
      }).unref()
    );
  }
};
