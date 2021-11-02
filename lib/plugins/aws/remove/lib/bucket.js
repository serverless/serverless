'use strict';

const BbPromise = require('bluebird');
const { legacy } = require('@serverless/utils/log');

module.exports = {
  async setServerlessDeploymentBucketName() {
    return this.provider.getServerlessDeploymentBucketName().then((bucketName) => {
      this.bucketName = bucketName;
    });
  },

  async listObjectsV2() {
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

  async listObjectVersions() {
    this.objectsInBucket = [];

    this.serverless.cli.log('Getting all objects in S3 bucket...');
    const serviceStage = `${this.serverless.service.service}/${this.provider.getStage()}`;

    const result = await this.provider.request('S3', 'listObjectVersions', {
      Bucket: this.bucketName,
      Prefix: `${this.provider.getDeploymentPrefix()}/${serviceStage}`,
    });

    if (result) {
      if (result.Versions) {
        result.Versions.forEach((object) => {
          this.objectsInBucket.push({
            Key: object.Key,
            VersionId: object.VersionId,
          });
        });
      }

      if (result.DeleteMarkers) {
        result.DeleteMarkers.forEach((object) => {
          this.objectsInBucket.push({
            Key: object.Key,
            VersionId: object.VersionId,
          });
        });
      }
    }
  },

  async listObjects() {
    const deploymentBucketObject = this.serverless.service.provider.deploymentBucketObject;
    return deploymentBucketObject && deploymentBucketObject.versioning
      ? this.listObjectVersions()
      : this.listObjectsV2();
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
