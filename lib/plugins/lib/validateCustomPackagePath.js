'use strict';

const path = require('path');
const ServerlessError = require('../../serverless-error');

function isSubDirectory(serviceDir, packageDir) {
  if (serviceDir.substr(-1) !== '/') serviceDir += '/';
  if (packageDir.substr(-1) !== '/') packageDir += '/';

  return serviceDir.startsWith(path.resolve(packageDir));
}

module.exports = {
  validateCustomPackagePath() {
    if (this.options.package) {
      if (isSubDirectory(this.serverless.serviceDir, this.options.package)) {
        throw new ServerlessError(
          'Package output includes service directory',
          'INVALID_PACKAGE_ARTIFACT_PATH'
        );
      }
    }
  },
};
