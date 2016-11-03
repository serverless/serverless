'use strict';

const BbPromise = require('bluebird');

module.exports = {
  createDeploymentBucket() {
    // check if the bucket could be found beforehand
    if (this.deploymentBucket) {
      return BbPromise.resolve();
    }

    this.serverless.cli.log('Creating new deployment bucket…');

    return this.provider.request('storage', 'createBucket', this.deploymentBucketName)
      .then((data) => {
        this.deploymentBucket = data;
        return BbPromise.resolve();
      });
  },
};
