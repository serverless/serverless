'use strict';

const BbPromise = require('bluebird');

module.exports = {
  setBucketName() {
    if (this.bucketName) {
      return BbPromise.resolve(this.bucketName);
    }

    if (this.options.noDeploy) {
      return BbPromise.resolve();
    }

    return this.provider.getServerlessDeploymentBucketName()
      .then((bucketName) => {
        this.bucketName = bucketName;
      });
  },
};
