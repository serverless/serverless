'use strict';

/* eslint-disable no-use-before-define */

const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const BbPromise = require('bluebird');
const filesize = require('filesize');
const normalizeFiles = require('../../lib/normalizeFiles');

const NUM_CONCURRENT_UPLOADS = 3;

module.exports = {
  uploadArtifacts() {
    return BbPromise.bind(this)
      .then(this.uploadCloudFormationFile)
      .then(this.uploadFunctions);
  },

  uploadCloudFormationFile() {
    this.serverless.cli.log('Uploading CloudFormation file to S3...');

    const compiledTemplateFileName = 'compiled-cloudformation-template.json';

    const compiledCfTemplate = this.serverless.service.provider.compiledCloudFormationTemplate;
    const normCfTemplate = normalizeFiles.normalizeCloudFormationTemplate(compiledCfTemplate);
    const fileHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(normCfTemplate))
      .digest('base64');

    let params = {
      Bucket: this.bucketName,
      Key: `${this.serverless.service.package.artifactDirectoryName}/${compiledTemplateFileName}`,
      Body: JSON.stringify(compiledCfTemplate),
      ContentType: 'application/json',
      Metadata: {
        filesha256: fileHash,
      },
    };

    const deploymentBucketObject = this.serverless.service.provider.deploymentBucketObject;
    if (deploymentBucketObject) {
      params = setServersideEncryptionOptions(params, deploymentBucketObject);
    }

    return this.provider.request('S3',
      'upload',
      params);
  },

  uploadZipFile(artifactFilePath) {
    const fileName = artifactFilePath.split(path.sep).pop();

    // TODO refactor to be async (use util function to compute checksum async)
    const data = fs.readFileSync(artifactFilePath);
    const fileHash = crypto.createHash('sha256').update(data).digest('base64');

    let params = {
      Bucket: this.bucketName,
      Key: `${this.serverless.service.package.artifactDirectoryName}/${fileName}`,
      Body: fs.createReadStream(artifactFilePath),
      ContentType: 'application/zip',
      Metadata: {
        filesha256: fileHash,
      },
    };

    const deploymentBucketObject = this.serverless.service.provider.deploymentBucketObject;
    if (deploymentBucketObject) {
      params = setServersideEncryptionOptions(params, deploymentBucketObject);
    }

    return this.provider.request('S3',
      'upload',
      params);
  },

  uploadFunctions() {
    this.serverless.cli.log('Uploading artifacts...');

    const functionNames = this.serverless.service.getAllFunctions();
    const artifactFilePaths = _.uniq(
      _.map(functionNames, (name) => {
        const functionArtifactFileName = this.provider.naming.getFunctionArtifactName(name);
        const functionObject = this.serverless.service.getFunction(name);
        functionObject.package = functionObject.package || {};
        const artifactFilePath = functionObject.package.artifact ||
          this.serverless.service.package.artifact;

        if (!artifactFilePath ||
          (this.serverless.service.artifact && !functionObject.package.artifact)) {
          if (this.serverless.service.package.individually || functionObject.package.individually) {
            const artifactFileName = functionArtifactFileName;
            return path.join(this.packagePath, artifactFileName);
          }
          return path.join(this.packagePath, this.provider.naming.getServiceArtifactName());
        }

        return artifactFilePath;
      })
    );

    return BbPromise.map(artifactFilePaths, (artifactFilePath) => {
      const stats = fs.statSync(artifactFilePath);
      this.serverless.cli.log(`Uploading service .zip file to S3 (${filesize(stats.size)})...`);
      return this.uploadZipFile(artifactFilePath);
    }, { concurrency: NUM_CONCURRENT_UPLOADS }
    );
  },
};

function setServersideEncryptionOptions(putParams, deploymentBucketOptions) {
  const encryptionFields = [
    ['serverSideEncryption', 'ServerSideEncryption'],
    ['sseCustomerAlgorithim', 'SSECustomerAlgorithm'],
    ['sseCustomerKey', 'SSECustomerKey'],
    ['sseCustomerKeyMD5', 'SSECustomerKeyMD5'],
    ['sseKMSKeyId', 'SSEKMSKeyId'],
  ];

  const params = putParams;

  encryptionFields.forEach((element) => {
    if (deploymentBucketOptions[element[0]]) {
      params[element[1]] = deploymentBucketOptions[element[0]];
    }
  }, this);

  return params;
}
