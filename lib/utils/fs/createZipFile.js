'use strict';

const path = require('path');
const _ = require('lodash');
const archiver = require('archiver');
const BbPromise = require('bluebird');
const fs = BbPromise.promisifyAll(require('fs'));
const walkDirSync = require('./walkDirSync');
const writeFileDir = require('./writeFileDir');
const getFileContent = require('./getFileContent');

function getFileContentAndStat(filePath, fullPath) {
  return BbPromise.all([
    // Get file contents and stat in parallel
    getFileContent(fullPath),
    fs.statAsync(fullPath),
  ]).then(result => ({
    data: result[0],
    stat: result[1],
    filePath,
  }));
}

function createZipFile(srcDirPath, zipFilePath, opts) {
  let files;
  let prefix;
  let filesToChmodPlusX;
  if (opts) {
    files = opts.prefix;
    prefix = opts.prefix;
    filesToChmodPlusX = opts.filesToChmodPlusX;

    if (files && files.length === 0) {
      return BbPromise.reject('No files to package');
    }
  }

  if (!files) {
    // NOTE: this can be really slow for large directories
    files = walkDirSync(srcDirPath).map(file => file.replace(path.join(srcDirPath, path.sep), ''));
  }

  const zip = archiver.create('zip');
  writeFileDir(zipFilePath);

  const output = fs.createWriteStream(zipFilePath);

  return new BbPromise((resolve, reject) => {
    output.on('close', () => resolve(zipFilePath));
    output.on('error', err => reject(err));
    zip.on('error', err => reject(err));

    output.on('open', () => {
      zip.pipe(output);

      const normalizedFiles = _.uniq(files.map(file => path.normalize(file)));

      return BbPromise.all(
        normalizedFiles.map(filePath =>
          getFileContentAndStat(filePath, path.resolve(srcDirPath, filePath))
        )
      )
        .then(contents => {
          _.forEach(_.sortBy(contents, ['filePath']), file => {
            const name = file.filePath.slice(prefix ? `${prefix}${path.sep}`.length : 0);
            let mode = file.stat.mode;
            if (
              filesToChmodPlusX &&
              _.includes(filesToChmodPlusX, name) &&
              file.stat.mode % 2 === 0
            ) {
              mode += 1;
            }
            zip.append(file.data, {
              name,
              mode,
              date: new Date(0), // necessary to get the same hash when zipping the same content
            });
          });

          zip.finalize();
        })
        .catch(reject);
    });
  });
}

module.exports = createZipFile;
