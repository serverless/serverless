'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');
const path = require('path');
const fileExists = require('./fs/fileExists');
const readFile = require('./fs/readFile');
const { registerJsParser } = require('./babelRegister');

const getServerlessConfigFilePath = serverless => {
  const servicePath = serverless.config.servicePath || process.cwd();

  if (serverless.processedInput.options.config) {
    const customPath = path.join(servicePath, serverless.processedInput.options.config);
    return fileExists(customPath).then(exists => (exists ? customPath : null));
  }

  const jsonPath = path.join(servicePath, 'serverless.json');
  const ymlPath = path.join(servicePath, 'serverless.yml');
  const yamlPath = path.join(servicePath, 'serverless.yaml');
  const jsPath = path.join(servicePath, 'serverless.js');
  const tsPath = path.join(servicePath, 'serverless.ts');

  return BbPromise.props({
    json: fileExists(jsonPath),
    yml: fileExists(ymlPath),
    yaml: fileExists(yamlPath),
    js: fileExists(jsPath),
    ts: fileExists(tsPath),
  }).then(exists => {
    if (exists.yaml) {
      return yamlPath;
    } else if (exists.yml) {
      return ymlPath;
    } else if (exists.json) {
      return jsonPath;
    } else if (exists.js) {
      return jsPath;
    } else if (exists.ts) {
      return tsPath;
    }

    return null;
  });
};

const handleJsConfigFile = jsConfigFile =>
  BbPromise.try(() => {
    // use require to load serverless.js
    // eslint-disable-next-line global-require
    const configExport = require(jsConfigFile);
    // In case of a promise result, first resolve it.
    return configExport.default || configExport;
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
        const fileExtension = _.last(_.split(configFilePath, '.'));
        const isJSConfigFile = fileExtension === 'js' || fileExtension === 'ts';

        if (isJSConfigFile) {
          registerJsParser(configFilePath);
          return handleJsConfigFile(configFilePath);
        }

        return readFile(configFilePath);
      }

      return '';
    }),
  serverless => `${serverless.processedInput.options.config} - ${serverless.config.servicePath}`
);

module.exports = { getServerlessConfigFile, getServerlessConfigFilePath };
