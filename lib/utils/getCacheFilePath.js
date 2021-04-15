'use strict';

const homedir = require('os').homedir();
const path = require('path');
const crypto = require('crypto');

const getCacheFilePath = function (srvcPath) {
  const serviceDir = srvcPath || process.cwd();
  const serviceDirHash = crypto.createHash('sha256').update(serviceDir).digest('hex');
  return path.join(homedir, '.serverless', 'cache', serviceDirHash, 'autocomplete.json');
};

module.exports = getCacheFilePath;
