'use strict';

const path = require('path');
const disableServerlessStatsRequests = require('@serverless/test/disable-serverless-stats-requests');
const customResourceZipGenerator = require('../lib/plugins/aws/customResources/generateZip');

disableServerlessStatsRequests(path.resolve(__dirname, '..'));

module.exports = require('@serverless/test/setup/mocha-reporter');

module.exports.deferredRunner.then(runner => {
  runner.on('suite end', suite => {
    if (!suite.parent || !suite.parent.root) return;

    // Ensure to reset memoization on custom resource zip generator after each test file run.
    // Reason is that homedir is automatically cleaned for each test,
    // therefore eventually built custom resource file is also removed
    customResourceZipGenerator.cache.clear();
  });
});
