'use strict';

const path = require('path');
const getServerlessDir = require('./getServerlessDir');
const writeFileSync = require('../fs/writeFileSync');

function updateConfig(config) {
  const configPath = path.join(getServerlessDir(), '.serverlessrc');
  return writeFileSync(configPath, JSON.stringify(config, null, 2));
}

module.exports = updateConfig;
