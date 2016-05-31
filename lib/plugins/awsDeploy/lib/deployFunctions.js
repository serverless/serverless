'use strict';

const fs = require('fs');
const path = require('path');
const BbPromise = require('bluebird');
const zip = require('node-zip')();
const forEach = require('lodash').forEach;
const AWS = require('aws-sdk');

module.exports = {
  validateForDeployFunctions() {
    if (!this.serverless.service.service) {
      throw new this.serverless.classes.Error('Please set a valid service name.');
    }

    if (!this.options.region) {
      throw new this.serverless.classes.Error('Please pass in a valid region.');
    }

    BbPromise.resolve();
  },

  extractFunctionHandlers() {
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
    this.deployedFunctions.forEach((func, index) => {
      const servicePath = this.serverless.config.servicePath;

      const splittedHandler = func.handler.split(path.sep);

      const zipFileName = `${(splittedHandler.slice(-1)[0]).split('.')[0]}.zip`;
      const jsFileName = `${(splittedHandler.slice(-1)[0]).split('.')[0]}.js`;
      const pathToJsFile = path.join(servicePath, jsFileName);

      zip.file(jsFileName, fs.readFileSync(pathToJsFile));
      const data = zip.generate({ base64: false, compression: 'DEFLATE' });

      fs.writeFileSync(path.join(servicePath, zipFileName), data, 'binary');

      this.deployedFunctions[index].zipFilePath = path.join(servicePath, zipFileName);
    });

    return BbPromise.resolve();
  },

  uploadZipFilesToS3Bucket() {
    const bucketName = `${this.serverless.service.service}-${this.options.region}`;
    const s3 = new AWS.S3();

    // TODO: get URL from SDK rather than creating it like this
    const s3BaseUrl = `${bucketName}.s3-${this.options.region}.amazonaws.com/`;

    const uploadPromises = [];

    this.deployedFunctions.forEach((func, index) => {
      const fileName = func.handler.split(path.sep).slice(-1)[0];

      const params = {
        Bucket: bucketName,
        Key: fileName,
        Body: func.zipFilePath,
      };

      const putObjectPromise = s3.putObject(params).promise();

      // add the URL to the file in the S3 bucket
      this.deployedFunctions[index].s3Url = `${s3BaseUrl}${fileName}`;

      uploadPromises.push(putObjectPromise);
    });

    return BbPromise.all(uploadPromises);
  },

  deployFunctions() {
    return BbPromise.bind(this)
      .then(this.validateForDeployFunctions)
      .then(this.extractFunctionHandlers)
      .then(this.zipFunctions)
      .then(this.uploadZipFilesToS3Bucket);
  },
};
