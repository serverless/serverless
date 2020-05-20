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

const getServerlessConfigFilePath = serverless => {
  return getConfigFilePath(
    serverless.config.servicePath || process.cwd(),
    serverless.processedInput.options
  );
};

const handleJsOrTsConfigFile = (configFile, isTs) =>
  BbPromise.try(() => {
    if (isTs) {
      // eslint-disable-next-line global-require
      require('ts-node').register();
    }
    // use require to load serverless config file
    // eslint-disable-next-line global-require
    const configExport = require(configFile);
    // In case of a promise result, first resolve it.
    return configExport;
  }).then(config => {
    if (_.isPlainObject(config)) {
      return config;
    }
    throw new Error(`serverless.${isTs ? 'ts' : 'js'} must export plain object`);
  });

const getServerlessConfigFile = _.memoize(
  serverless =>
    getServerlessConfigFilePath(serverless).then(configFilePath => {
      if (configFilePath !== null) {
        const fileExtension = _.last(_.split(configFilePath, '.'));
        const isJSConfigFile = fileExtension === 'js';
        const isTSConfigFile = fileExtension === 'ts';

        if (isJSConfigFile || isTSConfigFile) {
          return handleJsOrTsConfigFile(configFilePath, isTSConfigFile);
        }

        return readFile(configFilePath).then(result => result || {});
      }

      return '';
    }),
  serverless => `${serverless.processedInput.options.config} - ${serverless.config.servicePath}`
);

module.exports = { getConfigFilePath, getServerlessConfigFile, getServerlessConfigFilePath };
