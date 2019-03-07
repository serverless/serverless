'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');
const path = require('path');
const fileExists = require('./fs/fileExists');
const readFile = require('./fs/readFile');

const getServerlessConfigFilePath = (srvcPath) => {
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
  }).then(exists => {
    if (exists.json) {
      return jsonPath;
    } else if (exists.yml) {
      return ymlPath;
    } else if (exists.yaml) {
      return yamlPath;
    } else if (exists.js) {
      return jsPath;
    }

    return null;
  });
};

const handleJsConfigFile = (jsConfigFile) => BbPromise.try(() => {
  // use require to load serverless.js
  // eslint-disable-next-line global-require
  const configExport = require(jsConfigFile);
  // In case of a promise result, first resolve it.
  return configExport;
}).then(config => {
  if (_.isPlainObject(config)) {
    return config;
  }
  throw new Error('serverless.js must export plain object');
});

const getServerlessConfigFile = _.memoize(srvcPath => getServerlessConfigFilePath(srvcPath)
  .then(configFilePath => {
    if (configFilePath !== null) {
      const isJSConfigFile = _.last(_.split(configFilePath, '.')) === 'js';

      if (isJSConfigFile) {
        return handleJsConfigFile(configFilePath);
      }

      return readFile(configFilePath);
    }

    return '';
  })
);

module.exports = { getServerlessConfigFile, getServerlessConfigFilePath };
