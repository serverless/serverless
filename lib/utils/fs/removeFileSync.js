'use strict';

const fse = require('./fse');

function removeFileSync(filePath) {
  return fse.removeSync(filePath);
}

module.exports = removeFileSync;
