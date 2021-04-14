'use strict';

const path = require('path');
const fse = require('fs-extra');

module.exports = {
  async moveArtifactsToPackage() {
    const packagePath =
      this.options.package ||
      this.serverless.service.package.path ||
      path.join(this.serverless.serviceDir || '.', '.serverless');

    // Only move the artifacts if it was requested by the user
    if (this.serverless.serviceDir && !packagePath.endsWith('.serverless')) {
      const serverlessTmpDirPath = path.join(this.serverless.serviceDir, '.serverless');

      if (this.serverless.utils.dirExistsSync(serverlessTmpDirPath)) {
        if (this.serverless.utils.dirExistsSync(packagePath)) {
          fse.removeSync(packagePath);
        }
        this.serverless.utils.writeFileDir(packagePath);
        this.serverless.utils.copyDirContentsSync(serverlessTmpDirPath, packagePath);
        fse.removeSync(serverlessTmpDirPath);
      }
    }
  },

  async moveArtifactsToTemp() {
    const packagePath =
      this.options.package ||
      this.serverless.service.package.path ||
      path.join(this.serverless.serviceDir || '.', '.serverless');

    // Only move the artifacts if it was requested by the user
    if (this.serverless.serviceDir && !packagePath.endsWith('.serverless')) {
      const serverlessTmpDirPath = path.join(this.serverless.serviceDir, '.serverless');

      if (this.serverless.utils.dirExistsSync(packagePath)) {
        if (this.serverless.utils.dirExistsSync(serverlessTmpDirPath)) {
          fse.removeSync(serverlessTmpDirPath);
        }
        this.serverless.utils.writeFileDir(serverlessTmpDirPath);
        this.serverless.utils.copyDirContentsSync(packagePath, serverlessTmpDirPath);
      }
    }
  },
};
