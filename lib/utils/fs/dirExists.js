'use strict';

const fse = require('./fse');

function dirExists(path) {
  return fse
    .lstatAsync(path)
    .then(stats => stats.isDirectory())
    .catch(() => false);
}

module.exports = dirExists;
