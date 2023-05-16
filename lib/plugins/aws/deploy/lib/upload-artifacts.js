'use strict';

const _ = require('lodash');
const fsp = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const limit = require('ext/promise/limit').bind(Promise);
const { filesize } = require('filesize');
const normalizeFiles = require('../../lib/normalize-files');
const getLambdaLayerArtifactPath = require('../../utils/get-lambda-layer-artifact-path');
const ServerlessError = require('../../../../serverless-error');
const setS3UploadEncryptionOptions = require('../../../../aws/set-s3-upload-encryption-options');
const { progress, log } = require('@serverless/utils/log');

const MAX_CONCURRENT_ARTIFACTS_UPLOADS =
  Number(process.env.SLS_MAX_CONCURRENT_ARTIFACTS_UPLOADS) || 3;

module.exports = {
  async getFileStats(filepath) {
    try {
      return await fsp.stat(filepath);
    } catch (error) {
      throw new ServerlessError(
        `Cannot read file artifact "${filepath}": ${error.message}`,
        'INACCESSIBLE_FILE_ARTIFACT'
      );
    }
  },

  async uploadArtifacts() {
    const artifactFilePaths = [
      ...(await this.getFunctionArtifactFilePaths()),
      ...this.getLayerArtifactFilePaths(),
    ];
    if (artifactFilePaths.length === 1) {
      const stats = await this.getFileStats(artifactFilePaths[0]);
      progress.get('main').notice(`Uploading (${filesize(stats.size)})`);
    } else {
      progress.get('main').notice(`Uploading (0/${artifactFilePaths.length})`);
    }

    await this.uploadCloudFormationFile();
    await this.uploadStateFile();
    await this.uploadFunctionsAndLayers();
    await this.uploadCustomResources();
  },

  async uploadCloudFormationFile() {
    log.info('Uploading CloudFormation file to S3');

    const compiledTemplateFileName = this.provider.naming.getCompiledTemplateS3Suffix();

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
      params = setS3UploadEncryptionOptions(params, deploymentBucketObject);
    }

    return this.provider.request('S3', 'upload', params);
  },
  async uploadStateFile() {
    log.info('Uploading State file to S3');

    const basename = this.provider.naming.getServiceStateFileName();
    const content = await fsp.readFile(
      path.join(this.serverless.serviceDir, '.serverless', basename),
      'utf-8'
    );

    const stateObject = JSON.parse(content);
    const fileHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(normalizeFiles.normalizeState(stateObject)))
      .digest('base64');

    let params = {
      Bucket: this.bucketName,
      Key: `${this.serverless.service.package.artifactDirectoryName}/${basename}`,
      Body: content,
      ContentType: 'application/json',
      Metadata: { filesha256: fileHash },
    };

    const deploymentBucketObject = this.serverless.service.provider.deploymentBucketObject;
    if (deploymentBucketObject) {
      params = setS3UploadEncryptionOptions(params, deploymentBucketObject);
    }

    return this.provider.request('S3', 'upload', params);
  },

  async getFunctionArtifactFilePaths() {
    const functionNames = this.serverless.service.getAllFunctions();
    return _.uniq(
      (
        await Promise.all(
          functionNames.map(async (name) => {
            const functionObject = this.serverless.service.getFunction(name);
            if (functionObject.image) return null;
            const functionArtifactFileName = this.provider.naming.getFunctionArtifactName(name);
            functionObject.package = functionObject.package || {};
            let artifactFilePath =
              functionObject.package.artifact || this.serverless.service.package.artifact;

            if (
              !artifactFilePath ||
              (this.serverless.service.artifact && !functionObject.package.artifact)
            ) {
              if (
                this.serverless.service.package.individually ||
                functionObject.package.individually
              ) {
                const artifactFileName = functionArtifactFileName;
                artifactFilePath = path.join(this.packagePath, artifactFileName);
              } else {
                artifactFilePath = path.join(
                  this.packagePath,
                  this.provider.naming.getServiceArtifactName()
                );
              }
            }
            functionObject.artifactSize = (await this.getFileStats(artifactFilePath)).size;
            return artifactFilePath;
          })
        )
      ).filter(Boolean)
    );
  },

  getLayerArtifactFilePaths() {
    const layerNames = this.serverless.service.getAllLayers();
    return layerNames
      .map((name) => {
        const layerObject = this.serverless.service.getLayer(name);
        if (layerObject.artifactAlreadyUploaded) {
          log.info(`Skipped uploading ${name}`);
          return null;
        }
        return getLambdaLayerArtifactPath(
          this.packagePath,
          name,
          this.provider.serverless.service,
          this.provider.naming
        );
      })
      .filter(Boolean);
  },

  async uploadFunctionsAndLayers() {
    const artifactFilePaths = [
      ...(await this.getFunctionArtifactFilePaths()),
      ...this.getLayerArtifactFilePaths(),
    ];

    const shouldReportDetailedProgress = artifactFilePaths.length > 1;
    let alreadyUploadedCount = 0;

    const limitedUpload = limit(
      MAX_CONCURRENT_ARTIFACTS_UPLOADS,
      async ({ filename, s3KeyDirname }) => {
        const stats = await this.getFileStats(filename);
        const fileName = path.basename(filename);
        log.info(`Uploading service ${fileName} file to S3 (${filesize(stats.size)})`);
        if (shouldReportDetailedProgress) {
          progress
            .get(`upload:${fileName}`)
            .notice(`Uploading service ${fileName} file to S3 (${filesize(stats.size)})`);
        }
        const result = await this.uploadZipFile({
          filename,
          s3KeyDirname,
        });
        alreadyUploadedCount += 1;
        if (shouldReportDetailedProgress) {
          progress
            .get('main')
            .notice(`Uploading (${alreadyUploadedCount}/${artifactFilePaths.length})`);
          progress.get(`upload:${fileName}`).remove();
        }
        return result;
      }
    );
    const uploadPromises = artifactFilePaths.map((filename) =>
      limitedUpload({
        filename,
        s3KeyDirname: this.serverless.service.package.artifactDirectoryName,
      })
    );
    await Promise.all(uploadPromises);
  },

  async uploadCustomResources() {
    const artifactFilePath = path.join(
      this.serverless.serviceDir,
      '.serverless',
      this.provider.naming.getCustomResourcesArtifactName()
    );

    if (this.serverless.utils.fileExistsSync(artifactFilePath)) {
      log.info('Uploading custom CloudFormation resources');
      await this.uploadZipFile({
        filename: artifactFilePath,
        s3KeyDirname: this.serverless.service.package.artifactDirectoryName,
      });
    }
  },
};
