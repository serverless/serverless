'use strict';

const fse = require('fs-extra');

function dirExists(path) {
  return fse.lstat(path).then(
    stats => stats.isDirectory(),
    error => {
      if (error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  );
}

module.exports = dirExists;
