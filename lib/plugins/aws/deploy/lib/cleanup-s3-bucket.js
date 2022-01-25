'use strict';

const _ = require('lodash');
const findAndGroupDeployments = require('../../utils/find-and-group-deployments');
const getS3ObjectsFromStacks = require('../../utils/get-s3-objects-from-stacks');
const { log } = require('@serverless/utils/log');

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
    await this.provider.request('S3', 'deleteObjects', {
      Bucket: this.bucketName,
      Delete: { Objects: objectsToRemove },
    });
  },

  async cleanupS3Bucket() {
    if (this.serverless.service.provider.deploymentWithEmptyChangeSet) {
      log.info('Removing unnecessary service artifacts from S3');
      await this.cleanupArtifactsForEmptyChangeSet();
    } else {
      log.info('Removing old service artifacts from S3');
      const objectsToRemove = await this.getObjectsToRemove();
      await this.removeObjects(objectsToRemove);
    }
  },

  async cleanupArtifactsForEmptyChangeSet() {
    const response = await this.provider.request('S3', 'listObjectsV2', {
      Bucket: this.bucketName,
      Prefix: this.serverless.service.package.artifactDirectoryName,
    });
    const service = this.serverless.service.service;
    const stage = this.provider.getStage();
    const deploymentPrefix = this.provider.getDeploymentPrefix();

    const objectsToRemove = getS3ObjectsFromStacks(
      findAndGroupDeployments(response, deploymentPrefix, service, stage),
      deploymentPrefix,
      service,
      stage
    );
    await this.removeObjects(objectsToRemove);
  },
};
