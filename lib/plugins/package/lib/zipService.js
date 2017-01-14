'use strict';

const exec = require('child_process').exec;
const BbPromise = require('bluebird');
const path = require('path');
const fs = require('fs');
const glob = require('glob-all');

module.exports = {
  zipDirectory(servicePath, exclude, include, zipFileName) {
    const patterns = getFilesPatters(exclude, include);
    const filePaths = getFilesToZip(servicePath, patterns);
    const artifactFilePath = path.join(servicePath, '.serverless', zipFileName);
    const zipCommand = `zip ${artifactFilePath} ${filePaths.join(' ')}`;

    this.serverless.utils.writeFileDir(artifactFilePath);

    return new BbPromise((resolve, reject) => {
      exec(zipCommand, (error, stdout, stderr) => {
        if (error || stderr) {
          return reject(error);
        }

        return resolve(artifactFilePath);
      });
    });
  },
};

function getFilesPatters(exclude, include) {
  const patterns = ['**'];

  exclude.forEach((pattern) => {
    if (pattern.charAt(0) === '!') {
      patterns.push(pattern.substring(1));
    } else {
      patterns.push(`!${pattern}`);
    }
  });

  // push the include globs to the end of the array
  // (files and folders will be re-added again even if they were excluded beforehand)
  patterns.concat(include);

  return patterns;
}

function getFilesToZip(servicePath, patterns) {
  const files = glob.sync(patterns, {
    cwd: servicePath,
    dot: true,
    silent: true,
    follow: true,
  });

  return files.map((filePath) => path.resolve(servicePath, filePath))
    .filter((fullPath) => !fs.statSync(fullPath).isDirectory(fullPath));
}
