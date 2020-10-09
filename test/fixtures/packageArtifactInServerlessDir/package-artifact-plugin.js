'use strict';

const { promisify } = require('util');
const path = require('path');
const copyFile = promisify(require('fs').copyFile);

// sha256 hash: `T0qEYHOE4Xv2E8Ar03xGogAlElcdf/dQh/lh9ao7Glo=`
const ZIP_NAME = 'my-own.zip';

/**
 * Simple plugin to move prepackaged zip file to `.serverless/NAME.zip` during
 * packaging and set `package.artifact`.
 */
class PackageArtifactPlugin {
  constructor(serverless) {
    this.serverless = serverless;
    this.hooks = {
      'before:package:createDeploymentArtifacts': this.package.bind(this),
    };
  }

  async package() {
    const zipSrcPath = path.resolve(ZIP_NAME);
    const serverlessDirPath = path.resolve(this.serverless.config.servicePath, '.serverless');
    const zipDestPath = path.join(serverlessDirPath, ZIP_NAME);

    // Copy zip to `.serverless` directory
    await copyFile(zipSrcPath, zipDestPath);

    // Mutate package.artifact to point to `.serverless/NAME.zip`
    this.serverless.service.package.artifact = zipDestPath;
  }
}

module.exports = PackageArtifactPlugin;
