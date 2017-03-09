'use strict';

const fs = require('fs');
const BbPromise = require('bluebird');
const filesize = require('filesize');
const path = require('path');

module.exports = {
  uploadCloudFormationFile() {
    this.serverless.cli.log('Uploading CloudFormation file to S3...');

    const compiledTemplateFileName = this.provider.naming.getCompiledTemplateFileName();

    const body = JSON.stringify(this.compiledTemplateFileBody);

    const params = {
      Bucket: this.bucketName,
      Key: `${this.packageS3DirKey}/${compiledTemplateFileName}`,
      Body: body,
      ContentType: 'application/json',
    };

    return this.provider.request('S3',
      'putObject',
      params,
      this.options.stage,
      this.options.region);
  },

  uploadZipFile(functionName) {
    let fileName = this.provider.naming.getServiceArtifactName();

    if (functionName) {
      fileName = this.provider.naming.getFunctionArtifactName(functionName);
    }
    const artifactFilePath = path.join(this.packagePath, fileName);

    const params = {
      Bucket: this.bucketName,
      Key: `${this.packageS3DirKey}/${fileName}`,
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
    let shouldUploadService = false;
    this.serverless.cli.log('Uploading function .zip files to S3...');
    const functionNames = this.serverless.service.getAllFunctions();
    const uploadPromises = functionNames.map(name => {
      const functionObject = this.serverless.service.getFunction(name);
      functionObject.package = functionObject.package || {};
      if ((functionObject.package && functionObject.package
          .individually) || this.serverless.service.package.individually) {
        return this.uploadZipFile(functionObject.artifact);
      }
      shouldUploadService = true;
      return BbPromise.resolve();
    });

    return BbPromise.all(uploadPromises).then(() => {
      if (shouldUploadService) {
        const stats = fs.statSync(this.serverless.service.package.artifact);
        this.serverless.cli.log(`Uploading service .zip file to S3 (${filesize(stats.size)})...`);
        return this.uploadZipFile(this.serverless.service.package.artifact);
      }
      return BbPromise.resolve();
    });
    if (this.serverless.service.package.individually) {
      this.serverless.cli.log('Uploading function .zip files to S3...');

      const functionNames = this.serverless.service.getAllFunctions();
      const uploadPromises = functionNames.map(name => this.uploadZipFile(name));

      return BbPromise.all(uploadPromises);
    }

    const fileName = this.provider.naming.getServiceArtifactName();
    const artifactFilePath = path.join(this.packagePath, fileName);

    const stats = fs.statSync(artifactFilePath);
    this.serverless.cli.log(`Uploading service .zip file to S3 (${filesize(stats.size)})...`);
    return this.uploadZipFile();
  },

  uploadArtifacts() {
    return BbPromise.bind(this)
      .then(this.uploadCloudFormationFile)
      .then(this.uploadFunctions);
  },
};
