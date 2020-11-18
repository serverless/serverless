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
  let fixtureData;
  if (options.fixture) {
    fixtureData = await fixtures.setup(options.fixture, { configExt: options.configExt });
    runServerlessOptions.cwd = fixtureData.servicePath;
  }
  try {
    const result = await runServerless(
      options.serverlessPath || serverlessPath,
      runServerlessOptions
    );
    result.fixtureData = fixtureData;
    return result;
  } catch (error) {
    error.fixtureData = fixtureData;
    throw error;
  }
};
