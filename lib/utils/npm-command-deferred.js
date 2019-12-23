'use strict';

const path = require('path');
const BbPromise = require('bluebird');
const fse = BbPromise.promisifyAll(require('fs-extra'));

const localNpmBinPath = path.join(__dirname, '../../node_modules/npm/bin/npm-cli.js');

module.exports = fse
  .statAsync(localNpmBinPath)
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
