'use strict';

const homedir = require('os').homedir();
const path = require('path');
const crypto = require('crypto');

const getCacheFilePath = function (srvcPath) {
  const servicePath = srvcPath || process.cwd();
  const servicePathHash = crypto.createHash('sha256').update(servicePath).digest('hex');
  return path.join(homedir, '.serverless', 'cache', servicePathHash, 'autocomplete.json');
};

module.exports = getCacheFilePath;
