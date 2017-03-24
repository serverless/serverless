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

    return getArtifactS3KeysArray(this.compiledTemplateFileBody, 'S3Key')
      .find(item => item !== false);
  },

  extendedValidate() {
    this.packagePath = this.options.package ||
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

    // compiled template file validation
    const compiledTemplateFileName = this.provider.naming.getCompiledTemplateFileName();
    this.compiledTemplateFilePath = path.join(this.packagePath, compiledTemplateFileName);
    if (!this.serverless.utils.fileExistsSync(this.compiledTemplateFilePath)) {
      throw new this.serverless.classes
        .Error(`No ${compiledTemplateFileName} file found in the package path you provided.`);
    }
    this.compiledTemplateFileBody = this.serverless
      .utils.readFileSync(this.compiledTemplateFilePath);

    if (!this.serverless.service.deploymentBucket) {
      // core template file validation
      const coreTemplateFileName = this.provider.naming.getCoreTemplateFileName();
      this.coreTemplateFilePath = path.join(this.packagePath, coreTemplateFileName);
      if (!this.serverless.utils.fileExistsSync(this.coreTemplateFilePath)) {
        throw new this.serverless.classes
          .Error(`No ${coreTemplateFileName} file found in the package path you provided.`);
      }
      this.coreTemplateFileBody = this.serverless
        .utils.readFileSync(this.coreTemplateFilePath);
    }

    this.packageS3DirKey = this.getArtifactS3Key().split(path.sep);
    this.packageS3DirKey.pop();
    this.packageS3DirKey = this.packageS3DirKey.join(path.sep);

    return BbPromise.resolve();
  },
};
