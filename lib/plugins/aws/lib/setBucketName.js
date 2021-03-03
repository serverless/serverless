'use strict';

module.exports = {
  async setBucketName() {
    if (this.bucketName) return;

    const bucketName = await this.provider.getServerlessDeploymentBucketName();
    this.bucketName = bucketName;
  },
};
