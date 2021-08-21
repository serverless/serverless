'use strict';

const fsp = require('fs').promises;

async function dirExists(path) {
  return fsp.lstat(path).then(
    (stats) => stats.isDirectory(),
    (error) => {
      if (error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  );
}

module.exports = dirExists;
