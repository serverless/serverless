'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');
const path = require('path');
const fileExists = require('./fs/fileExists');
const readFile = require('./fs/readFile');

const parseJsConf = fullPath =>
  BbPromise.try(() => {
    // use require to load serverless.js
    // eslint-disable-next-line global-require
    const configExport = require(fullPath);
    // In case of a promise result, first resolve it.
    return configExport;
  }).then(config => {
    if (_.isPlainObject(config)) {
      return config;
    }
    throw new Error('serverless.js must export plain object');
  });

const explicitFile = fullPath =>
  fileExists(fullPath).then(() => {
    switch (path.extname(fullPath).replace('.', '')) {
      case 'json':
      case 'yml':
      case 'yaml':
        return readFile(fullPath);
      case 'js':
        return parseJsConf(fullPath);
      default:
        return '';
    }
  });

const getServerlessConfigFile = _.memoize((srvcPath) => {
  if (srvcPath && !!path.extname(srvcPath)) return explicitFile(srvcPath);

  const servicePath = srvcPath || process.cwd();
  const jsonPath = path.join(servicePath, 'serverless.json');
  const ymlPath = path.join(servicePath, 'serverless.yml');
  const yamlPath = path.join(servicePath, 'serverless.yaml');
  const jsPath = path.join(servicePath, 'serverless.js');

  return BbPromise.props({
    json: fileExists(jsonPath),
    yml: fileExists(ymlPath),
    yaml: fileExists(yamlPath),
    js: fileExists(jsPath),
  }).then((exists) => {
    if (exists.json) {
      return readFile(jsonPath);
    } else if (exists.yml) {
      return readFile(ymlPath);
    } else if (exists.yaml) {
      return readFile(yamlPath);
    } else if (exists.js) {
      return parseJsConf(jsPath);
    }
    return '';
  });
});

module.exports = getServerlessConfigFile;
