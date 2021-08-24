'use strict';

module.exports = {
  generatePackageRuntimeMetadata() {
    // Don't regenerate name if it's already set
    if (!this.serverless.service.package.deploymentDirectoryPrefix) {
      const serviceStage = `${this.serverless.service.service}/${this.provider.getStage()}`;
      const prefix = this.provider.getDeploymentPrefix();
      this.serverless.service.package.deploymentDirectoryPrefix = `${prefix}/${serviceStage}`;
    }
    if (!this.serverless.service.package.timestamp) {
      const date = new Date();
      this.serverless.service.package.timestamp = `${date
        .getTime()
        .toString()}-${date.toISOString()}`;
    }
  },
};
