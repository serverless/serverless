'use strict';

const os = require('os');
const path = require('path');
const fse = require('fs-extra');
const BbPromise = require('bluebird');
const memoizee = require('memoizee');
const { version } = require('../../package');

const cachePath = path.resolve(os.homedir(), '.serverless/artifacts', version);

const ensureArtifact = memoizee(
  (fileName, generate) =>
    BbPromise.try(() => {
      return fse
        .lstat(path.resolve(cachePath, fileName))
        .then(
          stats => {
            if (stats.isFile()) return true;
            return false;
          },
          error => {
            if (error.code === 'ENOENT') return false;
            throw error;
          }
        )
        .then(isGenerated => {
          if (!isGenerated) return fse.ensureDir(cachePath).then(() => generate(cachePath));
          return null;
        })
        .then(() => cachePath);
    }),
  { length: 1 }
);

module.exports = (name, generate) => () => ensureArtifact(name, generate);

// Exposed for test needs
module.exports._ensureArtifact = ensureArtifact;
