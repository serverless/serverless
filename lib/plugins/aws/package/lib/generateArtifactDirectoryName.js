'use strict';

module.exports = {
  generateArtifactDirectoryName() {
    // Don't regenerate name if it's already set
    if (!this.serverless.service.package.artifactDirectoryName) {
      // note: artifactDirectoryName is deprecated and is kept here just for legacy plugins purposes
      this.serverless.service.package.artifactDirectoryName =
        this.serverless.getProvider('aws').s3DeploymentDirectoryPath;
    }
  },
};
