'use strict';

const path = require('path');
const fileExistsSync = require('./fs/fileExistsSync');
const readFileSync = require('./fs/readFileSync');

const getServerlessConfigFile = function (servicePath) {
  const ymlExists = fileExistsSync(path.join(servicePath, 'serverless.yml'));
  const yamlExists = fileExistsSync(path.join(servicePath, 'serverless.yaml'));
  const jsonExists = fileExistsSync(path.join(servicePath, 'serverless.json'));

  if (ymlExists) {
    return readFileSync(path.join(servicePath, 'serverless.yml'));
  } else if (yamlExists) {
    return readFileSync(path.join(servicePath, 'serverless.yaml'));
  } else if (jsonExists) {
    return readFileSync(path.join(servicePath, 'serverless.json'));
  }

  return '';
};

module.exports = getServerlessConfigFile;
