'use strict';

const fileExists = require('./fs/fileExists');
const readFile = require('./fs/readFile');
const getCacheFilePath = require('./getCacheFilePath');

const getCacheFile = function(servicePath) {
  const cacheFilePath = getCacheFilePath(servicePath);
  return fileExists(cacheFilePath).then(exists => {
    if (!exists) {
      return false;
    }
    return readFile(cacheFilePath);
  });
};

module.exports = getCacheFile;
