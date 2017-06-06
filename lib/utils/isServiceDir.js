'use strict';

const path = require('path');
const _ = require('lodash');
const walkDirSync = require('./fs/walkDirSync');

function isServiceDir(servicePath) {
  const validServerlessFileNames = [
    'serverless.yml',
    'serverless.yaml',
    'serverless.json',
  ];

  const allFiles = walkDirSync(servicePath);
  const preparedServerlessFileNames = validServerlessFileNames
    .map((fileName) => path.join(servicePath, fileName));

  const foundServerlessFiles = _.intersection(allFiles, preparedServerlessFileNames);

  if (foundServerlessFiles.length === 0) {
    return false;
  }

  return true;
}

module.exports = isServiceDir;
