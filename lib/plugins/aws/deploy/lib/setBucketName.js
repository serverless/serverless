'use strict';

module.exports = {
  setBucketName() {
    return this.sdk.getServerlessDeploymentBucketName(this.options.stage, this.options.region)
      .then((bucketName) => {
        this.bucketName = bucketName;
      });
  },
};
