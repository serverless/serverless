'use strict';

const fse = require('./fse');

function dirExistsSync(dirPath) {
  try {
    const stats = fse.statSync(dirPath);
    return stats.isDirectory();
  } catch (e) {
    return false;
  }
}

module.exports = dirExistsSync;
