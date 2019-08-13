'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');
const findAndGroupDeployments = require('../../utils/findAndGroupDeployments');
const getS3ObjectsFromStacks = require('../../utils/getS3ObjectsFromStacks');

module.exports = {
  getObjectsToRemove() {
    const stacksToKeepCount = 5;
    const service = this.serverless.service.service;
    const stage = this.provider.getStage();
    const prefix = this.provider.getDeploymentPrefix();

    return this.provider
      .request('S3', 'listObjectsV2', {
        Bucket: this.bucketName,
        Prefix: `${prefix}/${service}/${stage}`,
      })
      .then(response => {
        const stacks = findAndGroupDeployments(response, prefix, service, stage);
        const stacksToKeep = _.takeRight(stacks, stacksToKeepCount);
        const stacksToRemove = _.pullAllWith(stacks, stacksToKeep, _.isEqual);
        const objectsToRemove = getS3ObjectsFromStacks(stacksToRemove, prefix, service, stage);

        if (objectsToRemove.length) {
          return BbPromise.resolve(objectsToRemove);
        }

        return BbPromise.resolve([]);
      });
  },

  removeObjects(objectsToRemove) {
    if (objectsToRemove && objectsToRemove.length) {
      this.serverless.cli.log('Removing old service artifacts from S3...');

      return this.provider.request('S3', 'deleteObjects', {
        Bucket: this.bucketName,
        Delete: { Objects: objectsToRemove },
      });
    }

    return BbPromise.resolve();
  },

  cleanupS3Bucket() {
    return BbPromise.bind(this)
      .then(this.getObjectsToRemove)
      .then(this.removeObjects);
  },
};
