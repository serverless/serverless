'use strict';

const BbPromise = require('bluebird');

module.exports = {
  listObjects() {
    this.objectsInBucket = [];

    const bucketName = `${this.serverless.service.service}-${
      this.options.stage}-${this.options.region}`;
    this.serverless.cli.log('Getting all objects in S3 bucket...');
    return this.sdk.request('S3', 'listObjectsV2', {
      Bucket: bucketName,
    }, this.options.stage, this.options.region).then((result) => {
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

  deleteObjects() {
    const bucketName = `${this.serverless.service.service}-${
      this.options.stage}-${this.options.region}`;
    this.serverless.cli.log('Removing objects in S3 bucket...');
    if (this.objectsInBucket.length) {
      return this.sdk.request('S3', 'deleteObjects', {
        Bucket: bucketName,
        Delete: {
          Objects: this.objectsInBucket,
        },
      }, this.options.stage, this.options.region);
    }

    return BbPromise.resolve();
  },

  emptyS3Bucket() {
    return BbPromise.bind(this)
      .then(this.listObjects)
      .then(this.deleteObjects);
  },
};
