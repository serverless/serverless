'use strict';

const path = require('path');
const fse = require('./fse');
const walkDirSync = require('./walkDirSync');

function fileExists(srcDir, destDir, options) {
  const fullFilesPaths = walkDirSync(srcDir, options);

  fullFilesPaths.forEach(fullFilePath => {
    const relativeFilePath = fullFilePath.replace(srcDir, '');
    fse.copySync(fullFilePath, path.join(destDir, relativeFilePath));
  });
}

module.exports = fileExists;
