'use strict';

const BbPromise = require('bluebird');

module.exports = {
  getDeploymentBucket() {
    this.deploymentBucketName =
      `${this.serverless.service.service}-${this.options.region}-${this.options.stage}`;

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
