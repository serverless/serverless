'use strict';

const fs = require('fs');
const path = require('path');
const BbPromise = require('bluebird');
const filesize = require('filesize');

module.exports = {
  uploadCloudFormationFile() {
    this.serverless.cli.log('Uploading CloudFormation file to S3...');

    const body = JSON.stringify(this.serverless.service.provider.compiledCloudFormationTemplate);

    const fileName = 'compiled-cloudformation-template.json';

    const params = {
      Bucket: this.bucketName,
      Key: `${this.serverless.service.package.artifactDirectoryName}/${fileName}`,
      Body: body,
      ContentType: 'application/json',
    };

    return this.provider.request('S3',
      'putObject',
      params,
      this.options.stage,
      this.options.region);
  },

  uploadZipFile(artifactFilePath) {
    if (!artifactFilePath) {
      throw new this.serverless.classes.Error('artifactFilePath was not supplied');
    }


    const fileName = artifactFilePath.split(path.sep).pop();

    const params = {
      Bucket: this.bucketName,
      Key: `${this.serverless.service.package.artifactDirectoryName}/${fileName}`,
      Body: fs.createReadStream(artifactFilePath),
      ContentType: 'application/zip',
    };

    return this.provider.request('S3',
      'putObject',
      params,
      this.options.stage,
      this.options.region);
  },

  uploadFunctions() {
    if (this.serverless.service.package.individually) {
      this.serverless.cli.log('Uploading function .zip files to S3...');

      const functionNames = this.serverless.service.getAllFunctions();
      const uploadPromises = functionNames.map(name => {
        const functionObject = this.serverless.service.getFunction(name);
        return this.uploadZipFile(functionObject.artifact);
      });

      return BbPromise.all(uploadPromises);
    }

    const stats = fs.statSync(this.serverless.service.package.artifact);
    this.serverless.cli.log(`Uploading service .zip file to S3 (${filesize(stats.size)})...`);
    return this.uploadZipFile(this.serverless.service.package.artifact);
  },

  uploadArtifacts() {
    if (this.options.noDeploy) {
      return BbPromise.resolve();
    }

    return BbPromise.bind(this)
      .then(this.uploadCloudFormationFile)
      .then(this.uploadFunctions);
  },
};
