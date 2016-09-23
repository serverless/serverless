'use strict';

const archiver = require('archiver');
const BbPromise = require('bluebird');
const path = require('path');
const fs = require('fs');
const glob = require('glob');

module.exports = {
  zipDirectory(servicePath, exclude, zipFileName) {
    exclude.push('.serverless');

    const zip = archiver.create('zip');

    const artifactFilePath = path.join(
      servicePath,
      '.serverless',
      zipFileName
    );

    this.serverless.utils.writeFileDir(artifactFilePath);

    const output = fs.createWriteStream(artifactFilePath);

    output.on('open', () => {
      zip.pipe(output);

      glob('**', {
        cwd: servicePath,
        ignore: exclude,
      }, (err, files) => {
        files.forEach((filePath) => {
          const fullPath = path.resolve(
            servicePath,
            filePath
          );

          const stats = fs.statSync(fullPath);

          if (!stats.isDirectory(fullPath)) {
            zip.append(fs.readFileSync(fullPath), {
              name: filePath,
              mode: stats.mode,
            });
          }
        });

        zip.finalize();
      });
    });

    return new BbPromise((resolve, reject) => {
      output.on('close', () => resolve(artifactFilePath));
      zip.on('error', (err) => reject(err));
    });
  },
};
