'use strict';

const path = require('path');
const fse = require('fs-extra');

const localNpmBinPath = path.join(__dirname, '../../node_modules/npm/bin/npm-cli.js');

module.exports = fse
  .stat(localNpmBinPath)
  .then(
    stats => stats.isFile(),
    error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  )
  .then(isNpmInstalledLocaly => {
    return isNpmInstalledLocaly ? `node ${localNpmBinPath}` : 'npm';
  });
