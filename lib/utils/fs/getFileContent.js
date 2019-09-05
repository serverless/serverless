'use strict';

const BbPromise = require('bluebird');
const fs = BbPromise.promisifyAll(require('fs'));

function getFileContent(fullPath) {
  return fs.readFileAsync(fullPath);
}

module.exports = getFileContent;
