'use strict';

const fse = require('fs-extra');

function removeFile(filePath) {
  return fse.remove(filePath);
}

module.exports = removeFile;
