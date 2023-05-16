'use strict';

const path = require('path');
const _ = require('lodash');
const ServerlessError = require('../../../../serverless-error');
const { log } = require('@serverless/utils/log');

module.exports = {
  async extendedValidate() {
    // Restore state
    const serviceStateFileName = this.provider.naming.getServiceStateFileName();
    const serviceStateFilePath = path.join(
      this.serverless.serviceDir,
      '.serverless',
      serviceStateFileName
    );
    if (!this.serverless.utils.fileExistsSync(serviceStateFilePath)) {
      throw new ServerlessError(
        `No ${serviceStateFileName} file found in the package path you provided.`,
        'MISSING_SERVICE_STATE_FILE'
      );
    }
    this.state = this.serverless.utils.readFileSync(serviceStateFilePath);

    Object.assign(this.serverless.service, this.state.service);

    this.serverless.service.package.artifactDirectoryName =
      this.state.package.artifactDirectoryName;
    // only restore the default artifact path if the user is not using a custom path
    if (this.state.package.artifact && this.serverless.service.artifact) {
      this.serverless.service.package.artifact = path.join(
        this.serverless.serviceDir,
        '.serverless',
        this.state.package.artifact
      );
    }

    // Check function's attached to API Gateway timeout
    if (Object.keys(this.serverless.service.functions).length) {
      this.serverless.service.getAllFunctions().forEach((functionName) => {
        const functionObject = this.serverless.service.getFunction(functionName);

        // Check if function timeout is greater than API Gateway timeout
        if (functionObject.timeout > 30 && functionObject.events) {
          functionObject.events.forEach((event) => {
            if (Object.keys(event)[0] === 'http' && !event.http.async) {
              log.warning(
                [
                  `Function ${functionName} has timeout of ${functionObject.timeout} `,
                  "seconds, however, it's attached to API Gateway so it's automatically ",
                  'limited to 30 seconds.',
                ].join('')
              );
            }
          });
        }
      });
    }

    if (Object.keys(this.serverless.service.functions).length) {
      this.serverless.service.getAllFunctions().forEach((functionName) => {
        const functionObject = this.serverless.service.getFunction(functionName);
        if (functionObject.image) return;
        const individually =
          _.get(functionObject, 'package.individually') ||
          this.serverless.service.package.individually;

        // By default assume service-level package
        let artifactFileName = this.provider.naming.getServiceArtifactName();
        let artifactFilePath = path.join(this.packagePath, artifactFileName);

        if (individually) {
          // Use function-level generated artifact
          artifactFileName = this.provider.naming.getFunctionArtifactName(functionName);
          artifactFilePath = path.join(this.packagePath, artifactFileName);

          if (_.get(functionObject, 'package.artifact')) {
            // Use function-level artifact
            artifactFilePath = functionObject.package.artifact;
            artifactFileName = path.basename(artifactFilePath);
          }
        } else if (this.serverless.service.package.artifact) {
          // Use service-level artifact
          artifactFileName = artifactFilePath = this.serverless.service.package.artifact;
        }

        if (!this.serverless.utils.fileExistsSync(artifactFilePath)) {
          throw new ServerlessError(
            `No ${artifactFileName} file found in the package path you provided.`,
            'MISSING_ARTIFACT_FILE'
          );
        }
      });
    }
  },
};
