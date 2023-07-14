'use strict';

module.exports = {
  generateArtifactDirectoryName() {
    // Don't regenerate name if it's already set
    if (!this.serverless.service.package.artifactDirectoryName) {
      const date = new Date();
      const serviceStage = `${this.serverless.service.getShortServiceName()}/${this.provider.getStage()}`;
      const dateString = `${date.getTime().toString()}-${date.toISOString()}`;
      const prefix = this.provider.getDeploymentPrefix();
      this.serverless.service.package.artifactDirectoryName = `${prefix}/${serviceStage}/${dateString}`;
    }
  },
};
