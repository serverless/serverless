'use strict';

const BbPromise = require('bluebird');

module.exports = {
  getDeploymentBucket() {
    this.deploymentBucketName =
      `${this.serverless.service.service}-${this.options.region}-${this.options.stage}`;

    // check if bucket name contains "goog"
    if (this.deploymentBucketName.indexOf('goog') > -1) {
      const errorMessage = [
        'Google does not allow bucket names which start with "goog" or contain "google"',
        ' please change your service name to not start with "goog" / include "google"',
      ].join();
      throw new this.serverless.classes.Error(errorMessage);
    }

    this.deploymentBucket = null;

    return this.provider.request('storage', 'getBuckets')
      .then((data) => {
        if (data.length) {
          const bucket = data.find(item => item.id === this.deploymentBucketName);
          if (bucket) this.deploymentBucket = bucket;
        }
        return BbPromise.resolve();
      });
  },
};
