'use strict';

const BbPromise = require('bluebird');
const Zip = require('node-zip');
const path = require('path');
const fs = require('fs');
const _ = require('lodash');

module.exports = {
  zipService() {
    // check if the user has specified an own artifact
    if (this.serverless.service.package.artifact) {
      return BbPromise.resolve();
    }

    this.serverless.cli.log('Zipping service...');

    const zip = new Zip();
    const servicePath = this.serverless.config.servicePath;

    let exclude = this.serverless.service.package.exclude || [];

    // add defaults for exclude
    exclude = _.union(exclude, [
      '.git',
      '.gitignore',
      '.DS_Store',
      'serverless.yaml',
      'serverless.env.yaml',
    ]);

    const include = this.serverless.service.package.include || [];

    const zipFileName = `${this.serverless.service.service}-${(new Date).getTime().toString()}.zip`;

    this.serverless.utils.walkDirSync(servicePath).forEach((filePath) => {
      const relativeFilePath = path.relative(servicePath, filePath);

      const shouldBeExcluded = exclude.some(sRegex => {
        const regex = new RegExp(sRegex);
        const matches = regex.exec(relativeFilePath);
        return matches && matches.length > 0;
      });

      const shouldBeIncluded = include.some(sRegex => {
        const regex = new RegExp(sRegex);
        const matches = regex.exec(relativeFilePath);
        return matches && matches.length > 0;
      });

      if (!shouldBeExcluded || shouldBeIncluded) {
        zip.file(relativeFilePath, fs.readFileSync(filePath));
      }
    });

    const data = zip.generate({
      base64: false,
      compression: 'DEFLATE',
      platform: process.platform,
    });

    // TODO This can be refactored later on so that we don't need to create
    // a file in the .serverless directory
    const serverlessTmpDirPath = path.join(servicePath,
      '.serverless', 'README');
    this.serverless.utils.writeFileSync(serverlessTmpDirPath,
      'This directory can be ignored as its used for packaging and deployment');

    const artifactFilePath = path.join(servicePath, '.serverless', zipFileName);

    fs.writeFileSync(artifactFilePath, data, 'binary');

    this.serverless.service.package.artifact = artifactFilePath;

    return BbPromise.resolve();
  },
};
