'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');
const findAndGroupDeployments = require('../../utils/findAndGroupDeployments');
const getS3ObjectsFromStacks = require('../../utils/getS3ObjectsFromStacks');

const defaultOpts = {
  removeOldDeployments: true,
  stackVersionsToKeep: 5,
};

module.exports = {
  getObjectsToRemove() {
    const opts = _.defaults({}, this.serverless.service.provider, defaultOpts);
    if (opts.removeOldDeployments === false) {
      return BbPromise.resolve([]);
    }

    const stackVersionsToKeep = opts.stackVersionsToKeep;
    const service = this.serverless.service.service;
    const stage = this.provider.getStage();

    return this.provider.request('S3',
      'listObjectsV2',
      {
        Bucket: this.bucketName,
        Prefix: `serverless/${service}/${stage}`,
      })
      .then((response) => {
        const stacks = findAndGroupDeployments(response, service, stage);
        const stacksToKeep = _.takeRight(stacks, stackVersionsToKeep);
        const stacksToRemove = _.pullAllWith(stacks, stacksToKeep, _.isEqual);
        const objectsToRemove = getS3ObjectsFromStacks(stacksToRemove, service, stage);

        if (objectsToRemove.length) {
          return BbPromise.resolve(objectsToRemove);
        }

        return BbPromise.resolve([]);
      });
  },

  removeObjects(objectsToRemove) {
    if (objectsToRemove && objectsToRemove.length) {
      this.serverless.cli.log('Removing old service versions...');

      return this.provider.request('S3',
        'deleteObjects',
        {
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
