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
      '.serverless',
    ]);

    const include = this.serverless.service.package.include || [];

    const zipFileName = `${this.serverless.service.service}-${(new Date).getTime().toString()}.zip`;

    this.serverless.utils.walkDirSync(servicePath).forEach((filePath) => {
      const relativeFilePath = path.relative(servicePath, filePath);

      const shouldBeExcluded =
        exclude.some(value => relativeFilePath.toLowerCase().indexOf(value.toLowerCase()) > -1);

      const shouldBeIncluded =
        include.some(value => relativeFilePath.toLowerCase().indexOf(value.toLowerCase()) > -1);

      if (!shouldBeExcluded || shouldBeIncluded) {
        const permissions = fs.statSync(filePath).mode;
        zip.file(relativeFilePath, fs.readFileSync(filePath), { unixPermissions: permissions });
      }
    });

    const data = zip.generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      platform: process.platform,
    });

    const artifactFilePath = path.join(servicePath,
      '.serverless', zipFileName);
    this.serverless.utils.writeFileSync(artifactFilePath, data);

    this.serverless.service.package.artifact = artifactFilePath;

    return BbPromise.resolve();
  },
};
