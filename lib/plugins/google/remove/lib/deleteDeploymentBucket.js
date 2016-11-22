'use strict';

const BbPromise = require('bluebird');

module.exports = {
  deleteDeploymentBucket() {
    this.serverless.cli.log('Removing deployment bucket…');

    if (!this.deploymentBucket) {
      return BbPromise.resolve();
    }

    return this.deploymentBucket.deleteFiles()
      .then(() => this.deploymentBucket.delete());
  },
};
