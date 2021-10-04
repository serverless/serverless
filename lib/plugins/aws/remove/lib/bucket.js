'use strict';

const BbPromise = require('bluebird');
const { legacy } = require('@serverless/utils/log');

module.exports = {
  async setServerlessDeploymentBucketName() {
    return this.provider.getServerlessDeploymentBucketName().then((bucketName) => {
      this.bucketName = bucketName;
    });
  },

  async listObjects() {
    this.objectsInBucket = [];

    legacy.log('Getting all objects in S3 bucket...');
    const serviceStage = `${this.serverless.service.service}/${this.provider.getStage()}`;

    return this.provider
      .request('S3', 'listObjectsV2', {
        Bucket: this.bucketName,
        Prefix: `${this.provider.getDeploymentPrefix()}/${serviceStage}`,
      })
      .then((result) => {
        if (result) {
          result.Contents.forEach((object) => {
            this.objectsInBucket.push({
              Key: object.Key,
            });
          });
        }
        return BbPromise.resolve();
      });
  },

  async deleteObjects() {
    legacy.log('Removing objects in S3 bucket...');
    if (this.objectsInBucket.length) {
      return this.provider.request('S3', 'deleteObjects', {
        Bucket: this.bucketName,
        Delete: {
          Objects: this.objectsInBucket,
        },
      });
    }

    return BbPromise.resolve();
  },

  async emptyS3Bucket() {
    return BbPromise.bind(this)
      .then(this.setServerlessDeploymentBucketName)
      .then(this.listObjects)
      .then(this.deleteObjects);
  },
};
