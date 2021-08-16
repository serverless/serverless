'use strict';

const fsp = require('fs').promises;

async function fileExists(filePath) {
  return fsp
    .lstat(filePath)
    .then((stats) => stats.isFile())
    .catch(() => false);
}

module.exports = fileExists;
