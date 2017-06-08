'use strict';

const fse = require('./fse');

function fileExists(filePath) {
  return fse.lstatAsync(filePath)
    .then((stats) => stats.isFile())
    .catch((e) => false);
}

module.exports = fileExists;
