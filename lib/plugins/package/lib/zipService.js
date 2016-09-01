'use strict';

const BbPromise = require('bluebird');
const archiver = require('archiver');
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

    const zip = archiver.create('zip');
    const servicePath = this.serverless.config.servicePath;

    let exclude = this.serverless.service.package.exclude || [];

    // add defaults for exclude
    exclude = _.union(exclude, [
      '.git',
      '.gitignore',
      '.DS_Store',
      'serverless.yaml',
      'serverless.yml',
      '.serverless',
    ]);

    const include = this.serverless.service.package.include || [];
    const zipFileName = `${this.serverless.service.service}.zip`;

    const artifactFilePath = path.join(servicePath,
      '.serverless', zipFileName);

    this.serverless.utils.writeFileDir(artifactFilePath);

    const output = fs.createWriteStream(artifactFilePath);

    output.on('open', () => {
      zip.pipe(output);

      this.serverless.utils.walkDirSync(servicePath).forEach((filePath) => {
        const relativeFilePath = path.relative(servicePath, filePath);

        const shouldBeExcluded =
          exclude.some(value => relativeFilePath.toLowerCase().indexOf(value.toLowerCase()) > -1);

        const shouldBeIncluded =
          include.some(value => relativeFilePath.toLowerCase().indexOf(value.toLowerCase()) > -1);

        if (!shouldBeExcluded || shouldBeIncluded) {
          const permissions = fs.statSync(filePath).mode;

          zip.append(fs.readFileSync(filePath), { name: relativeFilePath, mode: permissions });
        }
      });

      zip.finalize();
    });

    return new BbPromise((resolve, reject) => {
      output.on('close', () => {
        this.serverless.service.package.artifact = artifactFilePath;
        return resolve();
      });

      zip.on('error', (err) => reject(err));
    });
  },
};
