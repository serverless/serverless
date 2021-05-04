'use strict';

const path = require('path');
const os = require('os');

module.exports = (() => {
  const resolvedHomeDir = os.homedir();
  if (!resolvedHomeDir) return null;
  return path.resolve(resolvedHomeDir, '.serverless', 'telemetry-cache');
})();
