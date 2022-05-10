'use strict';

const path = require('path');
const os = require('os');

// get .serverless home path
function getServerlessDir() {
  return path.join(os.homedir(), '.serverless');
}

module.exports = getServerlessDir;
