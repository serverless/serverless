'use strict';

const path = require('path');
const BbPromise = require('bluebird');
const _ = require('lodash');
const findReferences = require('../../utils/findReferences');

module.exports = {
  extendedValidate() {
    // Restore state
    const serviceStateFileName = this.provider.naming.getServiceStateFileName();
    const serviceStateFilePath = path.join(
      this.serverless.config.servicePath,
      '.serverless',
      serviceStateFileName
    );
    if (!this.serverless.utils.fileExistsSync(serviceStateFilePath)) {
      throw new this.serverless.classes.Error(
        `No ${serviceStateFileName} file found in the package path you provided.`
      );
    }
    const state = this.serverless.utils.readFileSync(serviceStateFilePath);
    const selfReferences = findReferences(state.service, '${self:}');
    _.forEach(selfReferences, ref => _.set(state.service, ref, this.serverless.service));

    _.assign(this.serverless.service, state.service);

    this.serverless.service.package.artifactDirectoryName = state.package.artifactDirectoryName;
    // only restore the default artifact path if the user is not using a custom path
    if (!_.isEmpty(state.package.artifact) && this.serverless.service.artifact) {
      this.serverless.service.package.artifact = path.join(
        this.serverless.config.servicePath,
        '.serverless',
        state.package.artifact
      );
    }

    // Check function's attached to API Gateway timeout
    if (!_.isEmpty(this.serverless.service.functions)) {
      this.serverless.service.getAllFunctions().forEach(functionName => {
        const functionObject = this.serverless.service.getFunction(functionName);

        // Check if function timeout is greater than API Gateway timeout
        if (functionObject.timeout > 30 && functionObject.events) {
          functionObject.events.forEach(event => {
            if (Object.keys(event)[0] === 'http') {
              const warnMessage = [
                `WARNING: Function ${functionName} has timeout of ${functionObject.timeout} `,
                "seconds, however, it's attached to API Gateway so it's automatically ",
                'limited to 30 seconds.',
              ].join('');

              this.serverless.cli.log(warnMessage);
            }
          });
        }
      });
    }

    if (!_.isEmpty(this.serverless.service.functions)) {
      this.serverless.service.getAllFunctions().forEach(functionName => {
        const functionObject = this.serverless.service.getFunction(functionName);
        const individually =
          (_.has(functionObject, ['package', 'individually']) &&
            functionObject.package.individually) ||
          this.serverless.service.package.individually;

        // By default assume service-level package
        let artifactFileName = this.provider.naming.getServiceArtifactName();
        let artifactFilePath = path.join(this.packagePath, artifactFileName);

        if (individually) {
          // Use function-level generated artifact
          artifactFileName = this.provider.naming.getFunctionArtifactName(functionName);
          artifactFilePath = path.join(this.packagePath, artifactFileName);

          if (_.has(functionObject, ['package', 'artifact'])) {
            // Use function-level artifact
            artifactFilePath = functionObject.package.artifact;
            artifactFileName = path.basename(artifactFilePath);
          }
        } else if (this.serverless.service.package.artifact) {
          // Use service-level artifact
          artifactFileName = artifactFilePath = this.serverless.service.package.artifact;
        }

        if (!this.serverless.utils.fileExistsSync(artifactFilePath)) {
          throw new this.serverless.classes.Error(
            `No ${artifactFileName} file found in the package path you provided.`
          );
        }
      });
    }

    return BbPromise.resolve();
  },
};
