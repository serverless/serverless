'use strict';

const path = require('path');
const localServerlessPath = require('../cli/local-serverless-path');

const serverlessPath = path.resolve(__dirname, '../..');

// This method should be kept as sync. The reason for it is the fact that
// telemetry generation and persistence needs to be run in sync manner
// and it depends on this function, either directly or indirectly.
module.exports = () => serverlessPath === localServerlessPath;
