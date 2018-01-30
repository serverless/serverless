'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const globby = require('globby');
const BbPromise = require('bluebird');
const _ = require('lodash');
const normalizeFiles = require('../../lib/normalizeFiles');

module.exports = {
  checkForChanges() {
    this.serverless.service.provider.shouldNotDeploy = false;

    if (this.options.force) {
      return BbPromise.resolve();
    }

    return BbPromise.bind(this)
      .then(this.getMostRecentObjects)
      .then(this.getObjectMetadata)
      .then(this.checkIfDeploymentIsNecessary);
  },

  getMostRecentObjects() {
    const service = this.serverless.service.service;

    const params = {
      Bucket: this.bucketName,
      Prefix: `serverless/${service}/${this.provider.getStage()}`,
    };

    return this.provider.request('S3',
      'listObjectsV2',
      params
    ).then((result) => {
      if (result && result.Contents && result.Contents.length) {
        const objects = result.Contents;

        const ordered = _.orderBy(objects, ['Key'], ['desc']);

        const firstKey = ordered[0].Key;
        const directory = firstKey.substring(0, firstKey.lastIndexOf('/'));

        const mostRecentObjects = ordered.filter((obj) => {
          const objKey = obj.Key;
          const objDirectory = objKey.substring(0, objKey.lastIndexOf('/'));

          return directory === objDirectory;
        });

        return BbPromise.resolve(mostRecentObjects);
      }

      return BbPromise.resolve([]);
    });
  },

  getObjectMetadata(objects) {
    if (objects && objects.length) {
      const headObjectObjects = objects
        .map((obj) => this.provider.request('S3',
          'headObject',
          {
            Bucket: this.bucketName,
            Key: obj.Key,
          }
        ));

      return BbPromise.all(headObjectObjects)
        .then((result) => result);
    }

    return BbPromise.resolve([]);
  },

  checkIfDeploymentIsNecessary(objects) {
    if (objects && objects.length) {
      const remoteHashes = objects.map((object) => object.Metadata.filesha256 || '');

      const serverlessDirPath = path.join(this.serverless.config.servicePath, '.serverless');

      // create a hash of the CloudFormation body
      const compiledCfTemplate = this.serverless.service.provider.compiledCloudFormationTemplate;
      const normCfTemplate = normalizeFiles.normalizeCloudFormationTemplate(compiledCfTemplate);
      const localCfHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(normCfTemplate))
        .digest('base64');

      // create hashes for all the zip files
      const zipFiles = globby.sync(['**.zip'], { cwd: serverlessDirPath, dot: true, silent: true });
      const zipFilePaths = zipFiles.map((zipFile) => path.join(serverlessDirPath, zipFile));
      const zipFileHashes = zipFilePaths.map((zipFilePath) => {
        // TODO refactor to be async (use util function to compute checksum async)
        const zipFile = fs.readFileSync(zipFilePath);
        return crypto.createHash('sha256').update(zipFile).digest('base64');
      });

      const localHashes = zipFileHashes;
      localHashes.push(localCfHash);

      if (_.isEqual(remoteHashes.sort(), localHashes.sort())) {
        this.serverless.service.provider.shouldNotDeploy = true;

        const message = [
          'Service files not changed. Skipping deployment...',
        ].join('');
        this.serverless.cli.log(message);
      }
    }

    return BbPromise.resolve();
  },
};
