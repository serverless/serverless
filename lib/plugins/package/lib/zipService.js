'use strict';

const archiver = require('archiver');
const BbPromise = require('bluebird');
const path = require('path');
const fs = require('fs');

module.exports = {
  zipDirectory(servicePath, exclude, include, zipFileName) {
    const zip = archiver.create('zip');

    const artifactFilePath = path.join(servicePath,
      '.serverless', zipFileName);

    this.serverless.utils.writeFileDir(artifactFilePath);

    const output = fs.createWriteStream(artifactFilePath);

    output.on('open', () => {
      zip.pipe(output);

      this.serverless.utils.walkDirSync(servicePath).forEach((filePath) => {
        const relativeFilePath = path.relative(servicePath, filePath);

        // ensure we don't include the new zip file in our zip
        if (relativeFilePath.startsWith('.serverless')) return;

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
      output.on('close', () => resolve(artifactFilePath));
      zip.on('error', (err) => reject(err));
    });
  },
};
