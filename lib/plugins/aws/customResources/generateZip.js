'use strict';

const os = require('os');
const path = require('path');
const { memoize } = require('lodash');
const BbPromise = require('bluebird');
const childProcess = BbPromise.promisifyAll(require('child_process'));
const fse = BbPromise.promisifyAll(require('fs-extra'));
const { version } = require('../../../../package');
const getTmpDirPath = require('../../../utils/fs/getTmpDirPath');
const createZipFile = require('../../../utils/fs/createZipFile');
const npmCommandDeferred = require('../../../utils/npm-command-deferred');

const srcDirPath = path.join(__dirname, 'resources');
const cachedZipFilePath = path.join(
  os.homedir(),
  '.serverless/cache/custom-resources',
  version,
  'custom-resources.zip'
);

module.exports = memoize(() =>
  fse
    .lstatAsync(cachedZipFilePath)
    .then(
      stats => {
        if (stats.isFile()) return true;
        return false;
      },
      error => {
        if (error.code === 'ENOENT') return false;
        throw error;
      }
    )
    .then(isCached => {
      if (isCached) return cachedZipFilePath;
      const ensureCachedDirDeferred = fse.ensureDirAsync(path.dirname(cachedZipFilePath));
      const tmpDirPath = getTmpDirPath();
      return fse
        .copyAsync(srcDirPath, tmpDirPath)
        .then(() => npmCommandDeferred)
        .then(npmCommand => childProcess.execAsync(`${npmCommand} install`, { cwd: tmpDirPath }))
        .then(() => ensureCachedDirDeferred)
        .then(() => createZipFile(tmpDirPath, cachedZipFilePath))
        .then(() => cachedZipFilePath);
    })
);

module.exports.cachedZipFilePath = cachedZipFilePath;
