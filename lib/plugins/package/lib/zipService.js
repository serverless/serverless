'use strict';

const which = require('which');
const archiver = require('archiver');
const exec = require('child_process').exec;
const BbPromise = require('bluebird');
const path = require('path');
const fs = require('fs');
const glob = require('glob-all');

module.exports = {
  zipDirectory(servicePath, exclude, include, zipFileName) {
    const patterns = getFilesPatters(exclude, include);
    const artifactFilePath = path.join(servicePath, '.serverless', zipFileName);

    this.serverless.utils.writeFileDir(artifactFilePath);

    return getFilesToZip(servicePath, patterns).then((filePaths) => {
      process.chdir(servicePath);
      return createZipArtifact(artifactFilePath, filePaths);
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
  include.forEach((pattern) => {
    patterns.push(pattern);
  });

  return patterns;
}

function getFilesToZip(servicePath, patterns) {
  return new BbPromise.fromCallback((cb) => {
    // sync version returns temp zip files from .serverless dir
    glob(patterns, {
      cwd: servicePath,
      dot: true,
      silent: true,
      follow: true,
    }, cb);
  }).filter((filePath) => {
    const stats = fs.statSync(path.resolve(servicePath, filePath));
    return !stats.isDirectory(filePath);
  });
}

function createZipArtifact(artifactFilePath, filePaths) {
  return isZipAvailable().then((useNativeZip) => {
    if (useNativeZip) {
      return zipWithNative(artifactFilePath, filePaths);
    }

    return zipWithArchiver(artifactFilePath, filePaths);
  });
}

function isZipAvailable() {
  return new BbPromise((resolve) => {
    which('zip', (error) => {
      return resolve(!Boolean(error));
    });
  });
}

function zipWithNative(artifactFilePath, filePaths) {
  const zipCommand = `zip --quiet ${artifactFilePath} ${filePaths.join(' ')}`;

  return new BbPromise((resolve, reject) => {
    exec(zipCommand, (error, stdout, stderr) => {
      return error || stderr
        ? reject(error)
        : resolve(artifactFilePath);
    });
  });
}

function zipWithArchiver(artifactFilePath, filePaths) {
  const zip = archiver.create('zip');
  const output = fs.createWriteStream(artifactFilePath);

  output.on('open', () => {
    zip.pipe(output);

    filePaths.forEach((filePath) => {
      const stats = fs.statSync(filePath);

      zip.append(fs.readFileSync(filePath), {
        name: filePath,
        mode: stats.mode,
      });
    });

    zip.finalize();
  });

  return new BbPromise((resolve, reject) => {
    output.on('close', () => resolve(artifactFilePath));
    zip.on('error', (err) => reject(err));
  });
}
