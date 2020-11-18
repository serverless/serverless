'use strict';

const path = require('path');
const runServerless = require('@serverless/test/run-serverless');
const fixtures = require('../fixtures');

const serverlessPath = path.join(__dirname, '../../');

module.exports = async options => {
  if (options.fixture && options.cwd) {
    throw new Error('Either "fixture" or "cwd" should be provided');
  }
  const runServerlessOptions = Object.assign({}, options);
  delete runServerlessOptions.serverlessPath;
  delete runServerlessOptions.fixture;
  delete runServerlessOptions.configExt;
  if (options.fixture) {
    const fixtureData = await fixtures.setup(options.fixture, { configExt: options.configExt });
    runServerlessOptions.cwd = fixtureData.servicePath;
  }

  return runServerless(options.serverlessPath || serverlessPath, runServerlessOptions);
};
