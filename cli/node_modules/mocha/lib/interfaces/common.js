/**
 * Functions common to more than one interface
 * @module lib/interfaces/common
 */

'use strict';

module.exports = function (suites, context) {

  return {
    /**
     * This is only present if flag --delay is passed into Mocha.  It triggers
     * root suite execution.  Returns a function which runs the root suite.
     */
    runWithSuite: function runWithSuite(suite) {
      return function run() {
        suite.run();
      };
    },

    /**
     * Execute before running tests.
     */
    before: function (name, fn) {
      suites[0].beforeAll(name, fn);
    },

    /**
     * Execute after running tests.
     */
    after: function (name, fn) {
      suites[0].afterAll(name, fn);
    },

    /**
     * Execute before each test case.
     */
    beforeEach: function (name, fn) {
      suites[0].beforeEach(name, fn);
    },

    /**
     * Execute after each test case.
     */
    afterEach: function (name, fn) {
      suites[0].afterEach(name, fn);
    },

    test: {
      /**
       * Pending test case.
       */
      skip: function (title) {
        context.test(title);
      }
    }
  }
};
