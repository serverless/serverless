'use strict';

const fse = require('fs-extra');

function removeFileSync(filePath) {
  return fse.removeSync(filePath);
}

module.exports = removeFileSync;
