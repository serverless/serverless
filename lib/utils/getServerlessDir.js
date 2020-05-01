'use strict';

const path = require('path');
const os = require('os');

// get .serverless home path
function getServerlessDir() {
  const defaultDir = path.join(os.homedir(), '.serverless');
  return process.env.SERVERLESS_HOME || defaultDir;
}

module.exports = getServerlessDir;
