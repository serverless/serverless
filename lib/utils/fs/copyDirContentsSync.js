'use strict';

const fs = require('fs');
const fse = require('./fse');

const isNotSymbolicLink = src => !fs.lstatSync(src).isSymbolicLink();

function copyDirContentsSync(srcDir, destDir, { noLinks = false } = {}) {
  const copySyncOptions = {
    dereference: true,
    filter: noLinks ? isNotSymbolicLink : null,
  };
  fse.copySync(srcDir, destDir, copySyncOptions);
}

module.exports = copyDirContentsSync;
