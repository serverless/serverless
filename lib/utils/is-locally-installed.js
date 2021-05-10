'use strict';

const path = require('path');
const resolveLocalServerlessPath = require('../cli/resolve-local-serverless-path');

const serverlessPath = path.resolve(__dirname, '../..');

module.exports = async () => {
  const localServerlessPath = await resolveLocalServerlessPath();
  return serverlessPath === localServerlessPath;
};
