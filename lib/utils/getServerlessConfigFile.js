'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');
const path = require('path');
const fileExists = require('./fs/fileExists');
const readFile = require('./fs/readFile');

const getConfigFilePath = (servicePath, options = {}) => {
  if (options.config) {
    const customPath = path.join(servicePath, options.config);
    return fileExists(customPath).then(exists => {
      return exists ? customPath : null;
    });
  }

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
    if (exists.yaml) {
      return yamlPath;
    } else if (exists.yml) {
      return ymlPath;
    } else if (exists.json) {
      return jsonPath;
    } else if (exists.js) {
      return jsPath;
    }

    return null;
  });
};

const getServerlessConfigFilePath = serverless => {
  return getConfigFilePath(
    serverless.config.servicePath || process.cwd(),
    serverless.processedInput.options
  );
};

const handleJsConfigFile = jsConfigFile =>
  BbPromise.try(() => {
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

const getServerlessConfigFile = _.memoize(
  serverless =>
    getServerlessConfigFilePath(serverless).then(configFilePath => {
      if (configFilePath !== null) {
        const isJSConfigFile = _.last(_.split(configFilePath, '.')) === 'js';

        if (isJSConfigFile) {
          return handleJsConfigFile(configFilePath);
        }

        return readFile(configFilePath).then(result => result || {});
      }

      return '';
    }),
  serverless => `${serverless.processedInput.options.config} - ${serverless.config.servicePath}`
);

module.exports = { getConfigFilePath, getServerlessConfigFile, getServerlessConfigFilePath };
