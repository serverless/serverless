'use strict';

const BbPromise = require('bluebird');
const path = require('path');
const fse = require('fs-extra');

module.exports = {
  cleanupTempDir() {
    if (this.serverless.config.servicePath) {
      const serverlessTmpDirPath = path.join(this.serverless.config.servicePath, '.serverless');

      if (this.serverless.utils.dirExistsSync(serverlessTmpDirPath)) {
        fse.removeSync(serverlessTmpDirPath);
      }
    }

    return BbPromise.resolve();
  },
};
