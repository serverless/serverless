'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {
  getObjectsToRemove() {
    return this.deploymentBucket.getFiles()
      .then((result) => {
        // simply resolve if there are no files at all
        if (!result.length || !result[0].length) {
          return BbPromise.resolve([]);
        }

        const files = result[0];

        // 4 old ones + the one which will be uploaded after the cleanup = 5
        const objectsToKeepCount = 4;

        const orderedObjects = _.orderBy(files, (file) => {
          const timestamp = file.name.match(/(serverless)\/(.+)\/(.+)\/(\d+)-(.+)\/(.+\.zip)/)[4];
          return timestamp;
        }, ['asc']);

        const objectsToKeep = _.takeRight(orderedObjects, objectsToKeepCount);
        const objectsToRemove = _.pullAllWith(files, objectsToKeep, _.isEqual);

        if (objectsToRemove.length) {
          return BbPromise.resolve(objectsToRemove);
        }

        return BbPromise.resolve([]);
      });
  },

  removeObjects(objectsToRemove) {
    if (!objectsToRemove.length) {
      return BbPromise.resolve();
    }

    const removePromises = [];
    objectsToRemove.forEach((object) => removePromises.push(object.delete()));

    return BbPromise.all(objectsToRemove);
  },

  cleanupDeploymentBucket() {
    this.serverless.cli.log('Removing old artifacts…');

    return BbPromise.bind(this)
      .then(this.getObjectsToRemove)
      .then(this.removeObjects);
  },
};
