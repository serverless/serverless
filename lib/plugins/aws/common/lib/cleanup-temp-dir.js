'use strict';

const path = require('path');
const fse = require('fs-extra');

module.exports = {
  async cleanupTempDir() {
    if (this.serverless.serviceDir) {
      const serverlessTmpDirPath = path.join(this.serverless.serviceDir, '.serverless');

      if (this.serverless.utils.dirExistsSync(serverlessTmpDirPath)) {
        fse.removeSync(serverlessTmpDirPath);
      }
    }
  },
};
