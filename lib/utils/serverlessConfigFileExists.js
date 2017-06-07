'use strict';

const path = require('path');
const fileExistsSync = require('./fs/fileExistsSync');

const serverlessConfigFileExists = function (servicePath) {
  const ymlExists = fileExistsSync(path.join(servicePath, 'serverless.yml'));
  const yamlExists = fileExistsSync(path.join(servicePath, 'serverless.yaml'));
  const jsonExists = fileExistsSync(path.join(servicePath, 'serverless.json'));

  if (ymlExists || yamlExists || jsonExists) return true;

  return false;
};

module.exports = serverlessConfigFileExists;
