'use strict';

const BbPromise = require('bluebird');
const path = require('path');
const fse = require('fs-extra');
const _ = require('lodash');

module.exports = {
  moveArtifactsToPackage() {
    const packagePath =
      this.options.package ||
      this.serverless.service.package.path ||
      path.join(this.serverless.config.servicePath || '.', '.serverless');

    // Only move the artifacts if it was requested by the user
    if (this.serverless.config.servicePath && !_.endsWith(packagePath, '.serverless')) {
      const serverlessTmpDirPath = path.join(this.serverless.config.servicePath, '.serverless');

      if (this.serverless.utils.dirExistsSync(serverlessTmpDirPath)) {
        if (this.serverless.utils.dirExistsSync(packagePath)) {
          fse.removeSync(packagePath);
        }
        this.serverless.utils.writeFileDir(packagePath);
        this.serverless.utils.copyDirContentsSync(serverlessTmpDirPath, packagePath);
        fse.removeSync(serverlessTmpDirPath);
      }
    }

    return BbPromise.resolve();
  },

  moveArtifactsToTemp() {
    const packagePath =
      this.options.package ||
      this.serverless.service.package.path ||
      path.join(this.serverless.config.servicePath || '.', '.serverless');

    // Only move the artifacts if it was requested by the user
    if (this.serverless.config.servicePath && !_.endsWith(packagePath, '.serverless')) {
      const serverlessTmpDirPath = path.join(this.serverless.config.servicePath, '.serverless');

      if (this.serverless.utils.dirExistsSync(packagePath)) {
        if (this.serverless.utils.dirExistsSync(serverlessTmpDirPath)) {
          fse.removeSync(serverlessTmpDirPath);
        }
        this.serverless.utils.writeFileDir(serverlessTmpDirPath);
        this.serverless.utils.copyDirContentsSync(packagePath, serverlessTmpDirPath);
      }
    }

    return BbPromise.resolve();
  },
};
