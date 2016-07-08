'use strict';

const fs = require('fs');
const path = require('path');
const BbPromise = require('bluebird');

module.exports = {
  getServiceObjectsFromS3Bucket() {
    const bucketName =
      `${this.serverless.service.service}-${this.options.stage}-${this.options.region}`;

    return this.sdk.request('S3',
      'listObjectsV2',
      { Bucket: bucketName },
      this.options.stage,
      this.options.region)
      .then((result) => {
        if (result.Contents.length) {
          const fileNames = result.Contents.map((object) => object.Key);

          const objectsToRemove = [];
          fileNames.forEach((fileName) => {
            const regex = new RegExp(/^(.+)-.+\.zip$/);

            if (fileName.match(regex)) {
              objectsToRemove.push({ Key: fileName });
            }
          });

          return BbPromise.resolve(objectsToRemove);
        }
        return BbPromise.resolve();
      });
  },

  cleanupS3Bucket(objectsToRemove) {
    if (objectsToRemove && objectsToRemove.length) {
      this.serverless.cli.log('Removing old service versions...');

      const bucketName =
        `${this.serverless.service.service}-${this.options.stage}-${this.options.region}`;

      return this.sdk.request('S3',
        'deleteObjects',
        {
          Bucket: bucketName,
          Delete: { Objects: objectsToRemove },
        },
        this.options.stage,
        this.options.region);
    }

    return BbPromise.resolve();
  },

  uploadZipFileToS3Bucket() {
    this.serverless.cli.log('Uploading .zip file to S3...');

    const bucketName =
      `${this.serverless.service.service}-${this.options.stage}-${this.options.region}`;

    const body = fs.readFileSync(this.serverless.service.package.artifact);

    const params = {
      Bucket: bucketName,
      Key: this.serverless.service.package.artifact.split(path.sep).pop(),
      Body: body,
    };

    return this.sdk.request('S3',
      'putObject',
      params,
      this.options.stage,
      this.options.region);
  },

  uploadDeploymentPackage() {
    return BbPromise.bind(this)
      .then(this.getServiceObjectsFromS3Bucket)
      .then(this.cleanupS3Bucket)
      .then(this.uploadZipFileToS3Bucket);
  },
};
