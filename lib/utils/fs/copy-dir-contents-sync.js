'use strict';

const fse = require('fs-extra');

const isNotSymbolicLink = (src) => !fse.lstatSync(src).isSymbolicLink();

function copyDirContentsSync(srcDir, destDir, { noLinks = false } = {}) {
  const copySyncOptions = {
    dereference: true,
    filter: noLinks ? isNotSymbolicLink : null,
  };
  fse.copySync(srcDir, destDir, copySyncOptions);
}

module.exports = copyDirContentsSync;
