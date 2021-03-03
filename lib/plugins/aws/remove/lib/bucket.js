'use strict';

module.exports = {
  async setServerlessDeploymentBucketName() {
    const bucketName = await this.provider.getServerlessDeploymentBucketName();
    this.bucketName = bucketName;
  },

  async listObjects() {
    this.objectsInBucket = [];

    this.serverless.cli.log('Getting all objects in S3 bucket...');
    const serviceStage = `${this.serverless.service.service}/${this.provider.getStage()}`;

    const result = await this.provider.request('S3', 'listObjectsV2', {
      Bucket: this.bucketName,
      Prefix: `${this.provider.getDeploymentPrefix()}/${serviceStage}`,
    });

    if (result) {
      result.Contents.forEach((object) => {
        this.objectsInBucket.push({
          Key: object.Key,
        });
      });
    }
  },

  async deleteObjects() {
    this.serverless.cli.log('Removing objects in S3 bucket...');
    if (this.objectsInBucket.length) {
      await this.provider.request('S3', 'deleteObjects', {
        Bucket: this.bucketName,
        Delete: {
          Objects: this.objectsInBucket,
        },
      });
    }
  },

  async emptyS3Bucket() {
    await this.setServerlessDeploymentBucketName();
    await this.listObjects();
    await this.deleteObjects();
  },
};
