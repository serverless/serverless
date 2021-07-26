'use strict';

const path = require('path');
const resolveLocalServerlessPath = require('../cli/resolve-local-serverless-path');

const serverlessPath = path.resolve(__dirname, '../..');

// This method should be kept as sync. The reason for it is the fact that
// telemetry generation and persistence needs to be run in sync manner
// and it depends on this function, either directly or indirectly.
module.exports = () => {
  const localServerlessPath = resolveLocalServerlessPath();
  return serverlessPath === localServerlessPath;
};
