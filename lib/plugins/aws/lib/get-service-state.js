'use strict';

const path = require('path');

module.exports = {
  getServiceState() {
    const stateFileName = this.provider.naming.getServiceStateFileName();
    const serviceDir = this.serverless.serviceDir;
    const packageDirName = this.options.package || '.serverless';

    const stateFilePath = path.resolve(serviceDir, packageDirName, stateFileName);
    return this.serverless.utils.readFileSync(stateFilePath);
  },
};
