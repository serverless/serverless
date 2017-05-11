'use strict';

const path = require('path');
const BbPromise = require('bluebird');
const _ = require('lodash');
const findReferences = require('../../utils/findReferences');

module.exports = {
  extendedValidate() {
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
    const selfReferences = findReferences(state.service, '${self:}');
    _.forEach(selfReferences, ref => _.set(state.service, ref, this.serverless.service));

    _.assign(this.serverless.service, state.service);

    this.serverless.service.package.artifactDirectoryName = state.package.artifactDirectoryName;
    // only restore the default artifact path if the user is not using a custom path
    if (!_.isEmpty(state.package.artifact) && this.serverless.service.artifact) {
      this.serverless.service.package.artifact = path
        .join(this.serverless.config.servicePath, '.serverless', state.package.artifact);
    }
    if (!_.isEmpty(this.serverless.service.functions) &&
        this.serverless.service.package.individually) {
      // artifact file validation (multiple function artifacts)
      this.serverless.service.getAllFunctions().forEach(functionName => {
        const artifactFileName = this.provider.naming.getFunctionArtifactName(functionName);
        const artifactFilePath = path.join(this.packagePath, artifactFileName);
        if (!this.serverless.utils.fileExistsSync(artifactFilePath)) {
          throw new this.serverless.classes
            .Error(`No ${artifactFileName} file found in the package path you provided.`);
        }
      });
    } else if (!_.isEmpty(this.serverless.service.functions)) {
      // artifact file validation (single service artifact)
      const artifactFileName = this.provider.naming.getServiceArtifactName();
      const artifactFilePath = path.join(this.packagePath, artifactFileName);
      if (!this.serverless.utils.fileExistsSync(artifactFilePath)) {
        throw new this.serverless.classes
          .Error(`No ${artifactFileName} file found in the package path you provided.`);
      }
    }

    return BbPromise.resolve();
  },
};
