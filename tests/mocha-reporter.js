'use strict';

// Unhandled rejections are not exposed in Mocha, enforce it
// https://github.com/mochajs/mocha/issues/2640
process.on('unhandledRejection', err => {
  throw err;
});

// If there's an uncaught exception after rest runner wraps up
// Mocha reports it with success exit code: https://github.com/mochajs/mocha/issues/3917
// Workaround that (otherwise we may end with green CI for failed builds):
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

// Speed up Bluebird's unhandled rejection notifications so it's on par with timing
// we observe with native promises, and so they do not interfere with an async leaks detector
const BbPromise = require('bluebird');
/* eslint-disable no-underscore-dangle */
BbPromise.prototype._ensurePossibleRejectionHandled = function () {
  if ((this._bitField & 524288) !== 0) return;
  this._setRejectionIsUnhandled();
  process.nextTick(() => this._notifyUnhandledRejection());
};
/* eslint-enable */

module.exports = class ServerlessSpec extends Spec {
  constructor(runner) {
    super(runner);
    runner.on('end', () =>
      setTimeout(() => {
        // If tests end with any orphaned async call then this callback will be invoked
        // It's a signal there's some promise chain (or in general async flow) miconfiguration
        throw new Error('Test ended with unfinished async jobs');
        // Timeout '5' to ensure no false positives, with '1' there are observable rare scenarios
        // of possibly a garbage collector delaying process exit being picked up
        // On Node.js v8+ '2' seems safe, while v6 needs '5'
      }, 6).unref()
    );
  }
};
