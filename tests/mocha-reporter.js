'use strict';

const path = require('path');
const disableServerlessStatsRequests = require('@serverless/test/disable-serverless-stats-requests');

disableServerlessStatsRequests(path.resolve(__dirname, '..'));

module.exports = require('@serverless/test/setup/mocha-reporter');
