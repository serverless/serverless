'use strict';

const fse = require('fs-extra');

function fileExists(filePath) {
  return fse
    .lstat(filePath)
    .then(stats => stats.isFile())
    .catch(() => false);
}

module.exports = fileExists;
