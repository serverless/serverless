'use strict';

const BbPromise = require('bluebird');

module.exports = {
  listObjects() {
    this.objectsInBucket = [];

    const bucketName = `${this.serverless.service.service}-${
      this.options.stage}-${this.options.region}`;
    this.serverless.cli.log('Getting all objects in S3 bucket...');

    return this.S3.listObjectsV2Promised({
      Bucket: bucketName,
    }).then((result) => {
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
      return this.S3.deleteObjectsPromised({
        Bucket: bucketName,
        Delete: {
          Objects: this.objectsInBucket,
        },
      });
    }

    return BbPromise.resolve();
  },

  emptyS3Bucket() {
    return BbPromise.bind(this)
      .then(this.listObjects)
      .then(this.deleteObjects);
  },
};
