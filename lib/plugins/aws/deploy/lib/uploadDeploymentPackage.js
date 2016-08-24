'use strict';

const fs = require('fs');
const path = require('path');
const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {
  getServiceObjectsFromS3Bucket() {
    // 4 old ones + the one which will be uploaded after the cleanup = 5
    const objectsToKeepCount = 4;

    return this.sdk.request('S3',
      'listObjectsV2',
      { Bucket: this.bucketName },
      this.options.stage,
      this.options.region)
      .then((result) => {
        if (result.Contents.length && result.Contents.length > objectsToKeepCount) {
          // TODO: update to account for individual packages uploads
          const fileNames = result.Contents.map((object) => object.Key);

          const serviceObjects = [];
          fileNames.forEach((fileName) => {
            const regex = new RegExp(/^(.+)-.+\.zip$/);

            if (fileName.match(regex)) {
              serviceObjects.push({ Key: fileName });
            }
          });

          // skip the last x versions and remove the other ones
          const objectsToKeep = _.takeRight((_.sortBy(serviceObjects, 'Key')), objectsToKeepCount);
          const objectsToRemove = _.pullAllWith(serviceObjects, objectsToKeep, _.isEqual);

          return BbPromise.resolve(objectsToRemove);
        }
        return BbPromise.resolve();
      });
  },

  cleanupS3Bucket(objectsToRemove) {
    if (objectsToRemove && objectsToRemove.length) {
      this.serverless.cli.log('Removing old service versions...');

      return this.sdk.request('S3',
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

  uploadPackageToS3Bucket() {
    this.serverless.cli.log('Uploading .zip files to S3...');

    if (this.serverless.service.package.individually) {
      const functionNames = this.serverless.service.getAllFunctions();
      const uploadPromises = functionNames.map(name => {
        const functionObject = this.serverless.service.getFunction(name);
        if (functionObject.artifact) {
          return this.uploadZipFileToS3Bucket(functionObject.artifact);
        }

        return BbPromise.resolve();
      });
      return BbPromise.all(uploadPromises);
    }

    const artifactFilePath = this.serverless.service.package.artifact;
    return this.uploadZipFileToS3Bucket(this.serverless.service.package.artifact);
  },

  uploadZipFileToS3Bucket(artifactFilePath) {
    const body = fs.readFileSync(artifactFilePath);

    const params = {
      Bucket: this.bucketName,
      Key: artifactFilePath.split(path.sep).pop(),
      Body: body,
    };

    return this.sdk.request('S3',
      'putObject',
      params,
      this.options.stage,
      this.options.region);
  },

  uploadDeploymentPackage() {
    if (this.options.noDeploy) {
      return BbPromise.resolve();
    }

    return BbPromise.bind(this)
      .then(this.getServiceObjectsFromS3Bucket)
      .then(this.cleanupS3Bucket)
      .then(this.uploadPackageToS3Bucket);
  },
};
