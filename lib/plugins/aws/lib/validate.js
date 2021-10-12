'use strict';

const path = require('path');
const ServerlessError = require('../../../serverless-error');

module.exports = {
  validate() {
    if (!this.serverless.serviceDir) {
      throw new ServerlessError(
        'This command can only be run inside a service directory',
        'MISSING_SERVICE_DIRECTORY'
      );
    }

    if (this.options.package) {
      if (this.serverless.serviceDir.startsWith(path.resolve(this.options.package))) {
        throw new ServerlessError(
          'Package output includes service directory',
          'INVALID_PACKAGE_ARTIFACT_PATH'
        );
      }
    }

    this.options.stage = this.provider.getStage();
    this.options.region = this.provider.getRegion();
  },
};
