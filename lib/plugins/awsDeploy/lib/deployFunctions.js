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
    this.functionHandlers = [];

    forEach(this.serverless.service.functions, (value, key) => {
      if (key !== 'name_template') {
        this.functionHandlers.push(value.handler);
      }
    });

    return BbPromise.resolve();
  },

  zipFunctions() {
    this.pathsToZipFiles = [];

    this.functionHandlers.forEach((handler) => {
      const servicePath = this.serverless.config.servicePath;

      const splittedHandler = handler.split(path.sep);

      const zipFileName = `${(splittedHandler.slice(-1)[0]).split('.')[0]}.zip`;
      const jsFileName = `${(splittedHandler.slice(-1)[0]).split('.')[0]}.js`;
      const pathToJsFile = path.join(servicePath, jsFileName);

      zip.file(jsFileName, fs.readFileSync(pathToJsFile));
      const data = zip.generate({ base64: false, compression: 'DEFLATE' });

      fs.writeFileSync(path.join(servicePath, zipFileName), data, 'binary');

      this.pathsToZipFiles.push(path.join(servicePath, zipFileName));
    });

    return BbPromise.resolve();
  },

  uploadZipFilesToS3Bucket() {
    const bucketName = `${this.serverless.service.service}-${this.options.region}`;
    const s3 = new AWS.S3();

    // TODO: get URL from SDK rather than creating it like this
    const s3BaseUrl = `${bucketName}.s3-${this.options.region}.amazonaws.com/`;
    this.uploadedZipFileUrls = this.pathsToZipFiles.map((pathToZipFile) => {
      return `${s3BaseUrl}${pathToZipFile.split(path.sep).slice(-1)[0]}`;
    });

    const uploadPromises = [];

    this.pathsToZipFiles.forEach((pathToZipFile) => {
      const fileName = pathToZipFile.split(path.sep).slice(-1)[0];

      const params = {
        Bucket: bucketName,
        Key: fileName,
        Body: pathToZipFile,
      };

      const putObjectPromise = s3.putObject(params).promise();

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
