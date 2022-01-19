'use strict';

const { log } = require('@serverless/utils/log');

module.exports = {
  async setServerlessDeploymentBucketName() {
    try {
      const bucketName = await this.provider.getServerlessDeploymentBucketName();
      this.bucketName = bucketName;
    } catch (err) {
      // If there is a validation error with expected message, it means that logical resource for
      // S3 bucket does not exist and we want to proceed with empty `bucketName`
      if (
        err.providerError.code !== 'ValidationError' ||
        !err.message.includes('does not exist for stack')
      ) {
        throw err;
      }
    }
  },

  async listObjectsV2() {
    this.objectsInBucket = [];

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

  async listObjectVersions() {
    this.objectsInBucket = [];

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
    if (this.bucketName && (await this.checkIfBucketExists(this.bucketName))) {
      await this.listObjects();
      await this.deleteObjects();
    } else {
      log.info('S3 bucket not found. Skipping S3 bucket objects removal');
    }
  },
};
