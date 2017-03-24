'use strict';

const path = require('path');
const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {
  getArtifactS3Key() {
    const getArtifactS3KeysArray = function (obj, key) {
      if (_.has(obj, key)) {
        return obj[key];
      }

      return _.flatten(_
        .map(obj, v => ((typeof v === 'object') ? getArtifactS3KeysArray(v, key) : false)), true);
    };

    return getArtifactS3KeysArray(this.serverless.service.compiledCloudFormationTemplate, 'S3Key')
      .find(item => item !== false);
  },

  extendedValidate() {
    this.packagePath =
      this.serverless.service.package.path ||
      path.join(this.serverless.config.servicePath, '.serverless');

    if (this.serverless.service.package.individually) {
      // artifact file validation (multiple function artifacts)
      this.serverless.service.getAllFunctions().forEach(functionName => {
        const artifactFileName = this.provider.naming.getFunctionArtifactName(functionName);
        const artifactFilePath = path.join(this.packagePath, artifactFileName);
        if (!this.serverless.utils.fileExistsSync(artifactFilePath)) {
          throw new this.serverless.classes
            .Error(`No ${artifactFileName} file found in the package path you provided.`);
        }
      });
    } else {
      // artifact file validation (single service artifact)
      const artifactFileName = this.provider.naming.getServiceArtifactName();
      const artifactFilePath = path.join(this.packagePath, artifactFileName);
      if (!this.serverless.utils.fileExistsSync(artifactFilePath)) {
        throw new this.serverless.classes
          .Error(`No ${artifactFileName} file found in the package path you provided.`);
      }
    }

    // Restore state
    const serviceStateFileName = this.provider.naming.getServiceStateFileName();
    const serviceStateFilePath = path.join(this.serverless.config.servicePath,
      '.serverless',
      serviceStateFileName);
    if (!this.serverless.utils.fileExistsSync(serviceStateFilePath)) {
      throw new this.serverless.classes
        .Error(`No ${serviceStateFileName} file found in the package path you provided.`);
    }
    const state = this.serverless
      .utils.readFileSync(serviceStateFilePath);
    _.assign(this.serverless.service, state);

    /*
    this.packageS3DirKey = this.getArtifactS3Key().split(path.sep);
    this.packageS3DirKey.pop();
    this.packageS3DirKey = this.packageS3DirKey.join(path.sep);
    */
    this.packageS3DirKey = this.serverless.service.package.artifactDirectoryName;

    return BbPromise.resolve();
  },
};
