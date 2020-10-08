'use strict';

const { promisify } = require('util');
const path = require('path');
const copyFile = promisify(require('fs').copyFile);

/**
 * Simple plugin to move prepackaged zip file to `.serverless/NAME.zip` during
 * packaging and set `package.artifact`.
 */
class PackageArtifactPlugin {
  constructor(serverless) {
    this.serverless = serverless;
    this.hooks = {
      'before:package:createDeploymentArtifacts': this.package.bind(this)
    };
  }

  async package() {
    const zipName = 'my-own.zip';
    const zipSrcPath = path.resolve(zipName);
    const serverlessDirPath = path.resolve(this.serverless.config.servicePath, '.serverless');
    const zipDestPath = path.join(serverlessDirPath, zipName)

    // Copy zip to `.serverless` directory
    await copyFile(zipSrcPath, zipDestPath);

    // Mutate package.artifact to point to `.serverless/NAME.zip`
    this.serverless.service.package.artifact = zipDestPath;
  }
}

module.exports = PackageArtifactPlugin;
