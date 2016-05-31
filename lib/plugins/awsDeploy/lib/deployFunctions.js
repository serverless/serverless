'use strict';

const fs = require('fs');
const path = require('path');
const BbPromise = require('bluebird');
const zip = require('node-zip')();
const forEach = require('lodash').forEach;
const AWS = require('aws-sdk');

module.exports = {

  extractFunctionHandlers() {
    this.deployedFunctions = [];
    forEach(this.serverless.service.functions, (value, key) => {
      if (key !== 'name_template') {
        this.deployedFunctions.push({
          name: key,
          handler: value.handler,
        });
      }
    });

    return BbPromise.resolve();
  },

  zipFunctions() {
    this.serverless.cli.log('Zipping functions...');
    this.deployedFunctions.forEach((func, index) => {
      const servicePath = this.serverless.config.servicePath;

      const splittedHandler = func.handler.split(path.sep);
      const jsFileName = `${(splittedHandler.slice(-1)[0]).split('.')[0]}.js`;
      const pathToJsFile = path.join(servicePath, jsFileName);
      const zipFileName = `${func.name}.zip`;

      zip.file(jsFileName, fs.readFileSync(pathToJsFile));
      const data = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE', platform: process.platform });

      this.deployedFunctions[index].zipFileData = data;
      this.deployedFunctions[index].zipFileKey = zipFileName;
    });

    return BbPromise.resolve();
  },

  uploadZipFilesToS3Bucket() {
    this.serverless.cli.log('Uploading zip files to S3...');
    const bucketName = `${this.serverless.service.service}-${this.options.region}`;
    const s3 = new AWS.S3();
    const uploadPromises = [];

    this.deployedFunctions.forEach(func => {
      const params = {
        Bucket: bucketName,
        Key: func.zipFileKey,
        Body: func.zipFileData,
      };

      const putObjectPromise = s3.putObject(params).promise();

      uploadPromises.push(putObjectPromise);
    });

    return BbPromise.all(uploadPromises);
  },

  deployFunctions() {
    return BbPromise.bind(this)
      .then(this.extractFunctionHandlers)
      .then(this.zipFunctions)
      .then(this.uploadZipFilesToS3Bucket);
  },
};
