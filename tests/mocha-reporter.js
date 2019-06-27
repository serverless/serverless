'use strict';

// Unhandled rejections are not exposed in Mocha, enforce it
// https://github.com/mochajs/mocha/issues/2640
process.on('unhandledRejection', err => {
  throw err;
});

const { join } = require('path');
const os = require('os');
const Spec = require('mocha/lib/reporters/spec');
const Runner = require('mocha/lib/runner');
const { ensureDirSync, removeSync } = require('fs-extra');
const chalk = require('chalk');
const { tmpDirCommonPath } = require('../tests/utils/fs');
const { skippedWithNotice } = require('../tests/utils/misc');

// Ensure faster tests propagation
// It's to expose errors otherwise hidden by race conditions
// Reported to Mocha with: https://github.com/mochajs/mocha/issues/3920
Runner.immediately = process.nextTick;

// Speed up Bluebird's unhandled rejection notifications so it's on par with timing
// we observe with native promises, and so they do not interfere with an async leaks detector
const BbPromise = require('bluebird');
/* eslint-disable no-underscore-dangle */
BbPromise.prototype._ensurePossibleRejectionHandled = function() {
  if ((this._bitField & 524288) !== 0) return;
  this._setRejectionIsUnhandled();
  process.nextTick(() => this._notifyUnhandledRejection());
};
/* eslint-enable */

// Ensure to not mess with real homedir
// Tests do not mock config handling, which during tests generates and edits user's serverlessrc
// By overriding homedir resolution we prevent updates to real ~/.serverlessrc
os.homedir = () => tmpDirCommonPath;
if (process.env.USERPROFILE) process.env.USERPROFILE = tmpDirCommonPath;
if (process.env.HOME) process.env.HOME = tmpDirCommonPath;

ensureDirSync(tmpDirCommonPath); // Ensure temporary homedir exists

module.exports = class ServerlessSpec extends Spec {
  constructor(runner) {
    super(runner);

    process.on('uncaughtException', err => {
      if (!process.listenerCount('exit')) {
        if (process.listenerCount('uncaughtException') === 1) {
          // Mocha didn't setup listeners yet, ensure error is exposed
          throw err;
        }

        // Mocha ignores uncaught exceptions if they happen in conext of skipped test, expose them
        // https://github.com/mochajs/mocha/issues/3938
        if (runner.currentRunnable.isPending()) throw err;
        return;
      }
      // If there's an uncaught exception after rest runner wraps up
      // Mocha reports it with success exit code: https://github.com/mochajs/mocha/issues/3917
      // Workaround that (otherwise we may end with green CI for failed builds):
      process.removeAllListeners('exit');
      throw err;
    });

    // After test run for given file finalizes:
    // - Enforce eventual current directory change was reverted
    // - Ensure to reset eventually created user config file
    const startCwd = process.cwd();
    const userConfig = join(tmpDirCommonPath, '.serverlessrc');
    runner.on('suite end', suite => {
      if (!suite.parent || !suite.parent.root) return; // Apply just on top level suites
      try {
        removeSync(userConfig);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      if (process.cwd() !== startCwd) {
        runner._abort = true; // eslint-disable-line no-underscore-dangle,no-param-reassign
        throw new Error(
          `Tests in ${suite.file.slice(startCwd.length + 1)} didn't revert ` +
            'current directory change. This may affect resuls of upcoming tests.'
        );
      }
    });

    runner.on('end', () => {
      // Output eventual skip notices
      if (skippedWithNotice.length) {
        const resolveTestName = test => {
          const names = [test.title];
          let parent = test.parent;
          while (parent) {
            if (parent.title) names.push(parent.title);
            parent = parent.parent;
          }
          return `${chalk.cyan(names.reverse().join(': '))} (in: ${chalk.grey(
            test.file.slice(process.cwd().length + 1)
          )})`;
        };
        process.stdout.write(
          ' Notice: Some tests were skipped due to following environment issues:' +
            `\n\n - ${skippedWithNotice
              .map(
                meta => `${resolveTestName(meta.context.test)}\n\n   ${chalk.red(meta.reason)}\n`
              )
              .join('\n - ')}\n\n`
        );
      }

      // Cleanup temporary homedir
      try {
        removeSync(tmpDirCommonPath);
      } catch (error) {
        // Safe to ignore
      }

      if (process.version[1] < 8) return; // Async leaks detector is not reliable in Node.js v6

      // Async leaks detection
      setTimeout(() => {
        // If tests end with any orphaned async call then this callback will be invoked
        // It's a signal there's some promise chain (or in general async flow) miconfiguration
        throw new Error('Test ended with unfinished async jobs');
        // Timeout '2' to ensure no false positives, with '1' there are observable rare scenarios
        // of possibly a garbage collector delaying process exit being picked up
      }, 2).unref();
    });
  }
};
