'use strict';

const fs = require('fs');
const path = require('path');
const BbPromise = require('bluebird');

module.exports = {
  uploadCloudFormationFile() {
    this.serverless.cli.log('Uploading CloudFormation file to S3...');

    const body = JSON.stringify(this.serverless.service.provider.compiledCloudFormationTemplate);

    const fileName = 'compiled-cloudformation-template.json';

    const params = {
      Bucket: this.bucketName,
      Key: `${this.serverless.service.package.artifactDirectoryName}/${fileName}`,
      Body: body,
    };

    return this.sdk.request('S3',
      'putObject',
      params,
      this.options.stage,
      this.options.region);
  },

  uploadZipFile() {
    this.serverless.cli.log('Uploading .zip file to S3...');

    const body = fs.readFileSync(this.serverless.service.package.artifact);

    const fileName = this.serverless.service.package.artifact.split(path.sep).pop();

    const params = {
      Bucket: this.bucketName,
      Key: `${this.serverless.service.package.artifactDirectoryName}/${fileName}`,
      Body: body,
    };

    return this.sdk.request('S3',
      'putObject',
      params,
      this.options.stage,
      this.options.region);
  },

  uploadArtifacts() {
    if (this.options.noDeploy) {
      return BbPromise.resolve();
    }

    return BbPromise.bind(this)
      .then(this.uploadCloudFormationFile)
      .then(this.uploadZipFile);
  },
};
