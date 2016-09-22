'use strict';

const BbPromise = require('bluebird');

module.exports = {
  setBucketName() {
    if (this.options.noDeploy) {
      return BbPromise.resolve();
    }

    if (this.serverless.service.provider.bucketName) {
      this.bucketName = this.serverless.service.provider.bucketName;
      return BbPromise.resolve();
    }

    return this.sdk.getServerlessDeploymentBucketName(this.options.stage, this.options.region)
      .then((bucketName) => {
        this.bucketName = bucketName;
      });
  },
};
