'use strict';

const fs = require('fs');
const path = require('path');
const BbPromise = require('bluebird');
const shell = require('shelljs');

module.exports = {
  updateCloudFormationFiles() {
    const serverlessDirPath = path.join(this.serverless.config.servicePath, '.serverless');
    const cfFileNameRegex = this.provider.naming.getCloudFormationFileNameRegex();
    const filesInServiceDir = fs.readdirSync(serverlessDirPath);
    const cfFiles = filesInServiceDir.filter((file) => file.match(cfFileNameRegex));

    cfFiles.forEach((file) => {
      const pathToFile = path.join(serverlessDirPath, file);
      shell.sed('-i', '%DEPLOYMENT-BUCKET-NAME%', this.bucketName, pathToFile);
    });

    return BbPromise.resolve();
  },
};
