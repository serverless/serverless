'use strict';

const homedir = require('os').homedir();
const path = require('path');
const md5 = require('md5');

const getCacheFilePath = function (servicePath) {
  return path.join(homedir, '.serverless', 'cache',
    md5(servicePath), 'autocomplete.json');
};

module.exports = getCacheFilePath;
