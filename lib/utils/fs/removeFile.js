'use strict';

const fse = require('./fse');

function removeFile(filePath) {
  return fse.removeAsync(filePath);
}

module.exports = removeFile;
