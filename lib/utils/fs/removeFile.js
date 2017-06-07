'use strict';

const fse = require('./fse');

function removeFile(filePath) {
  return fse.remove(filePath);
}

module.exports = removeFile;
