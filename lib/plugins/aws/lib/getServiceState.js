'use strict';

const path = require('path');

module.exports = {
  getServiceState() {
    const stateFileName = this.provider.naming.getServiceStateFileName();
    const servicePath = this.serverless.config.servicePath;
    const packageDirName = this.options.package || '.serverless';

    const stateFilePath = path.join(servicePath, packageDirName, stateFileName);
    return this.serverless.utils.readFileSync(stateFilePath);
  },
};
