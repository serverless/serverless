'use strict';

const path = require('path');

module.exports = {
  getServiceState() {
    const stateFileName = this.provider.naming.getServiceStateFileName();

    const stateFilePath = path.resolve(this.serverless.getPackageOutputDir(), stateFileName);
    return this.serverless.utils.readFileSync(stateFilePath);
  },
};
