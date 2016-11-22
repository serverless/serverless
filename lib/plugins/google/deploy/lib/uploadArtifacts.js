'use strict';

const path = require('path');

module.exports = {
  uploadArtifacts() {
    this.serverless.cli.log('Uploading artifacts…');

    const artifactFilePath = this.serverless.service.package.artifact;
    const fileName = artifactFilePath.split(path.sep).pop();

    return this.deploymentBucket.upload(artifactFilePath, {
      destination: `${this.serverless.service.package.artifactDirectoryName}/${fileName}`,
    }).then(() => {
      this.serverless.cli.log('Artifacts successfully uploaded…');
    });
  },
};
