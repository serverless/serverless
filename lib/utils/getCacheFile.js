'use strict';

const fileExistsSync = require('./fs/fileExistsSync');
const readFileSync = require('./fs/readFileSync');
const getCacheFilePath = require('./getCacheFilePath');

const getCacheFile = function (servicePath) {
  const cacheFilePath = getCacheFilePath(servicePath);
  if (!fileExistsSync(cacheFilePath)) return false;
  return readFileSync(cacheFilePath);
};

module.exports = getCacheFile;
