'use strict';

const path = require('path');
const runServerless = require('@serverless/test/run-serverless');
const BbPromise = require('bluebird');
const fixtures = require('../fixtures');

const serverlessPath = path.join(__dirname, '../../');

module.exports = options =>
  BbPromise.try(() => {
    if (options.fixture && options.cwd) {
      throw new Error('Either "fixture" or "cwd" should be provided');
    }
    const runServerlessOptions = Object.assign({}, options);
    delete runServerlessOptions.serverlessPath;
    delete runServerlessOptions.fixture;
    delete runServerlessOptions.configExt;
    const fixturePromise = options.fixture
      ? fixtures
          .setup(options.fixture, { configExt: options.configExt })
          .then(({ servicePath }) => (runServerlessOptions.cwd = servicePath))
      : BbPromise.resolve();
    return fixturePromise.then(() =>
      runServerless(options.serverlessPath || serverlessPath, runServerlessOptions)
    );
  });
