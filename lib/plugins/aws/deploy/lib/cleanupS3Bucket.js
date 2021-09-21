'use strict';

const _ = require('lodash');
const findAndGroupDeployments = require('../../utils/findAndGroupDeployments');
const getS3ObjectsFromStacks = require('../../utils/getS3ObjectsFromStacks');
const { legacy, log } = require('@serverless/utils/log');

module.exports = {
  async getObjectsToRemove() {
    const stacksToKeepCount = _.get(
      this.serverless,
      'service.provider.deploymentBucketObject.maxPreviousDeploymentArtifacts',
      5
    );

    const service = this.serverless.service.service;
    const stage = this.provider.getStage();
    const prefix = this.provider.getDeploymentPrefix();

    const response = await this.provider.request('S3', 'listObjectsV2', {
      Bucket: this.bucketName,
      Prefix: `${prefix}/${service}/${stage}`,
    });
    const stacks = findAndGroupDeployments(response, prefix, service, stage);
    const stacksToRemove = stacks.slice(0, -stacksToKeepCount || Infinity);

    return getS3ObjectsFromStacks(stacksToRemove, prefix, service, stage);
  },

  async removeObjects(objectsToRemove) {
    if (!objectsToRemove || !objectsToRemove.length) return;
    legacy.log('Removing old service artifacts from S3...');
    log.info('Removing old service artifacts from S3');
    await this.provider.request('S3', 'deleteObjects', {
      Bucket: this.bucketName,
      Delete: { Objects: objectsToRemove },
    });
  },

  async cleanupS3Bucket() {
    const objectsToRemove = await this.getObjectsToRemove();
    await this.removeObjects(objectsToRemove);
  },
};
