'use strict';

const path = require('path');
const fse = require('fs-extra');

function writeFileDir(filePath) {
  return fse.mkdirsSync(path.dirname(filePath));
}

module.exports = writeFileDir;
