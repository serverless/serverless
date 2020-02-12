'use strict';

const fse = require('./fse');

function dirExists(path) {
  return fse.lstatAsync(path).then(
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
