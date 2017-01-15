'use strict';

const which = require('which');
const archiver = require('archiver');
const exec = require('child_process').exec;
const BbPromise = require('bluebird');
const path = require('path');
const fs = require('fs');
const glob = require('glob-all');

/**
 * Combines exclude and include patterns into one array
 * respecting pattern overrides
 * @param {String[]} exclude Array of exclude patterns
 * @param {String[]} include Array of include patterns
 * @return {String[]} Combined array of patterns
 */
function getFilesPatterns(exclude, include) {
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

/**
 * Finds files matching given patterns and excluding directories
 * @param {String} servicePath Service path for searching
 * @param {String[]} patterns Array of globs to use for file matching
 */
function getFilesToZip(servicePath, patterns) {
  return BbPromise.fromCallback((cb) => {
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

/**
 * Checks whether machine has zip binary in PATH
 * return {Promise.<Boolean>} Is available - true/false
 */
function isZipAvailable() {
  return new BbPromise((resolve) => {
    which('zip', (error) => resolve(!error));
  });
}

/**
 * Get a list of arguments for zip command each less than ~100k chars
 * Format: ["'folder/file1' 'file2' 'file3'", ...]
 *
 * Because of MAX_ARG_STRLEN which causes 'spawn E2BIG' error in node.js
 * we chunk one huge command string into smaller
 * @param {String[]} filePaths Array of file paths to zip
 * @return {String[]} Array of arguments for zip
 */
function getZipArgsParts(filePaths) {
  const MAX_ARG_STRLEN = 128 * 1024;
  // Safety measure: don't push to the limits
  const maxArgLength = MAX_ARG_STRLEN - (16 * 1024);

  return filePaths.reduce((memo, filePath) => {
    const partIndex = memo.length - 1;
    const willFitIntoArgsPart = memo[partIndex].length < maxArgLength;

    if (willFitIntoArgsPart) {
      memo[partIndex] += `'${filePath}' `; // eslint-disable-line no-param-reassign
    } else {
      memo.push(`'${filePath}' `);
    }

    return memo;
  }, ['']);
}

/**
 * Zips given file paths into the destination path
 *
 * zip command supports globs by -i / -x args but it's not used deliberately
 * as it doesn't support ! negations, overrides and
 * compromises compatibility with the fallback which relies on files list from glob-all
 * @param {String} artifactFilePath Destination path of zip
 * @param {String[]} filePaths Array of file paths to zip
 * @return {Promise.<String>} Destination path of zip
 */
function zipWithNative(artifactFilePath, filePaths) {
  const filesArgParts = getZipArgsParts(filePaths);

  // Important: .each ensures it's running serially
  return BbPromise.each(filesArgParts, (filesArgPart) => {
    const zipCommand = `zip -r ${artifactFilePath} ${filesArgPart}`;

    return new BbPromise((resolve, reject) => {
      exec(zipCommand, (error, stdout, stderr) => {
        if (error || stderr) {
          return reject(error);
        }
        return resolve(artifactFilePath);
      });
    });
  }).then(() => artifactFilePath);
}

/**
 * Zips given file paths into a zip into the destination path
 *
 * Used as a fallback on systems where native zip command isn't
 * available. Usually slower and consumes more memory
 * @param {String} artifactFilePath Destination path of zip
 * @param {String[]} filePaths Array of file paths to zip
 * @return {Promise.<String>} Destination path of zip
 */
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

/**
 * Creates a zip artifact using the best way available
 * depending on the target system. Varies from native zip
 * to zipping with JavaScript implementation
 * @param {String} artifactFilePath Destination path of zip
 * @param {String[]} filePaths Array of file paths to zip
 * @return {Promise.<String>} Destination path of zip
 */
function createZipArtifact(artifactFilePath, filePaths) {
  return isZipAvailable().then((useNativeZip) => {
    if (useNativeZip) {
      return zipWithNative(artifactFilePath, filePaths);
    }

    return zipWithArchiver(artifactFilePath, filePaths);
  });
}

module.exports = {
  zipDirectory(servicePath, exclude, include, zipFileName) {
    const patterns = getFilesPatterns(exclude, include);
    const artifactFilePath = path.join(servicePath, '.serverless', zipFileName);

    this.serverless.utils.writeFileDir(artifactFilePath);

    return getFilesToZip(servicePath, patterns).then((filePaths) => {
      process.chdir(servicePath);
      return createZipArtifact(artifactFilePath, filePaths);
    });
  },
};
