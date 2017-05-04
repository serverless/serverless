'use strict';

const fse = require('./fse');

function fileExistsSync(filePath) {
  try {
    const stats = fse.lstatSync(filePath);
    return stats.isFile();
  } catch (e) {
    return false;
  }
}

module.exports = fileExistsSync;
