'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');
const path = require('path');
const fileExists = require('./fs/fileExists');
const readFile = require('./fs/readFile');

const getServerlessConfigFile = _.memoize((servicePath) => {
  const jsonPath = path.join(servicePath, 'serverless.json');
  const ymlPath = path.join(servicePath, 'serverless.yml');
  const yamlPath = path.join(servicePath, 'serverless.yaml');

  return BbPromise.props({
    json: fileExists(jsonPath),
    yml: fileExists(ymlPath),
    yaml: fileExists(yamlPath),
  }).then((exists) => {
    if (exists.json) {
      return readFile(jsonPath);
    } else if (exists.yml) {
      return readFile(ymlPath);
    } else if (exists.yaml) {
      return readFile(yamlPath);
    }
    return '';
  });
});

module.exports = getServerlessConfigFile;
