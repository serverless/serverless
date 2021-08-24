'use strict';

const _ = require('lodash');

module.exports = {
  async getObjectsToRemove() {
    const stacksToKeepCount = _.get(
      this.serverless,
      'service.provider.deploymentBucketObject.maxPreviousDeploymentArtifacts',
      5
    );

    const stacks = await this.findDeployments();
    const stacksToRemove = stacks.slice(0, -stacksToKeepCount || Infinity);
    const objectsToRemove = stacksToRemove.flatMap(({ prefix, templateDirectory, artifactNames }) =>
      [
        `${prefix}/${templateDirectory}/${this.provider.naming.getCompiledTemplateS3Suffix()}`,
        ...artifactNames,
      ].map((key) => ({ Key: key }))
    );

    if (objectsToRemove.length) return objectsToRemove;
    return [];
  },

  async removeObjects(objectsToRemove) {
    if (!objectsToRemove || !objectsToRemove.length) return;
    this.serverless.cli.log('Removing old service artifacts from S3...');
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
