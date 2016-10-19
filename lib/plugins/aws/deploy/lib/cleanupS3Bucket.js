'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {
  getObjectsToRemove() {
    // 4 old ones + the one which will be uploaded after the cleanup = 5
    const directoriesToKeepCount = 4;
    const serviceStage = `${this.serverless.service.service}/${this.options.stage}`;

    return this.provider.request('S3',
      'listObjectsV2',
      {
        Bucket: this.bucketName,
        Prefix: `serverless/${serviceStage}`,
      },
      this.options.stage,
      this.options.region)
      .then((result) => {
        if (result.Contents.length) {
          let directories = [];
          const regex = new RegExp(
            `serverless/${serviceStage}/(.+-.+-.+-.+)`
          );

          // get the unique directory names
          result.Contents.forEach((obj) => {
            const match = obj.Key.match(regex);

            if (match) {
              const directoryName = match[1];
              directories = _.union(directories, [directoryName]);
            }
          });

          // sort the directory names
          directories = directories.sort();

          const directoriesToKeep = _.takeRight(directories, directoriesToKeepCount);
          const directoriesToRemove = _.pullAllWith(directories, directoriesToKeep, _.isEqual);

          const objectsToRemove = [];

          // get all the objects in the directories which should be removed
          result.Contents.forEach((obj) => {
            directoriesToRemove.some((element) => {
              const match = obj.Key.match(element);
              if (match) objectsToRemove.push({ Key: obj.Key });
              return obj;
            });
          });

          return BbPromise.resolve(objectsToRemove);
        }

        return BbPromise.resolve();
      });
  },

  removeObjects(objectsToRemove) {
    if (objectsToRemove && objectsToRemove.length) {
      this.serverless.cli.log('Removing old service versions…');

      return this.provider.request('S3',
        'deleteObjects',
        {
          Bucket: this.bucketName,
          Delete: { Objects: objectsToRemove },
        },
        this.options.stage,
        this.options.region);
    }

    return BbPromise.resolve();
  },

  cleanupS3Bucket() {
    if (this.options.noDeploy) {
      return BbPromise.resolve();
    }

    return BbPromise.bind(this)
      .then(this.getObjectsToRemove)
      .then(this.removeObjects);
  },
};
