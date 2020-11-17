'use strict';

const fse = require('fs-extra');

module.exports = {
  async cleanupTempDir() {
    if (this.serverless.config.servicePath) {
      const serverlessTmpDirPath = this.serverless.getWorkingTempDir();

      if (this.serverless.utils.dirExistsSync(serverlessTmpDirPath)) {
        fse.removeSync(serverlessTmpDirPath);
      }
    }
  },
};
