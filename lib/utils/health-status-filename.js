'use strict';

const path = require('path');
const os = require('os');

module.exports = path.resolve(os.homedir(), '.serverless/last-command-health-status');
