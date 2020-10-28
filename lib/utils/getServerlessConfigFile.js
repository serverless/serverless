'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');
const path = require('path');
const resolveModulePath = require('ncjsm/resolve');
const memoizee = require('memoizee');
const spawn = require('child-process-ext/spawn');
const fileExists = require('./fs/fileExists');
const readFile = require('./fs/readFile');
const ServerlessError = require('../classes/Error').ServerlessError;

const getConfigFilePath = async (servicePath, options = {}) => {
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

  const [jsonExists, ymlExists, yamlExists, jsExists, tsExists] = await Promise.all([
    fileExists(jsonPath),
    fileExists(ymlPath),
    fileExists(yamlPath),
    fileExists(jsPath),
    fileExists(tsPath),
  ]);

  if (yamlExists) {
    return yamlPath;
  } else if (ymlExists) {
    return ymlPath;
  } else if (jsonExists) {
    return jsonPath;
  } else if (jsExists) {
    return jsPath;
  } else if (tsExists) {
    return tsPath;
  }

  return null;
};

const getServerlessConfigFilePath = serverless => {
  return getConfigFilePath(
    serverless.config.servicePath || process.cwd(),
    serverless.processedInput.options
  );
};

const resolveTsNode = serviceDir => {
  const resolveModuleRealPath = (...args) =>
    resolveModulePath(...args).then(({ realPath }) => realPath);

  const ifNotFoundContinueWith = cb => error => {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    return cb();
  };

  const resolveAsServerlessPeerDependency = () => resolveModuleRealPath(__dirname, 'ts-node');
  const resolveAsServiceDependency = () => resolveModuleRealPath(serviceDir, 'ts-node');
  const resolveAsGlobalInstallation = () =>
    spawn('npm', ['root', '-g']).then(
      ({ stdoutBuffer }) => require.resolve(`${String(stdoutBuffer).trim()}/ts-node`),
      error => {
        if (error.code !== 'ENOENT') throw error;
        throw Object.assign(new Error('npm not installed', { code: 'MODULE_NOT_FOUND' }));
      }
    );
  const throwTsNodeError = () => {
    throw new ServerlessError(
      'Ensure "ts-node" dependency when working with TypeScript configuration files',
      'TS_NODE_NOT_FOUND'
    );
  };

  return resolveAsServerlessPeerDependency()
    .catch(ifNotFoundContinueWith(resolveAsServiceDependency))
    .catch(ifNotFoundContinueWith(resolveAsGlobalInstallation))
    .catch(ifNotFoundContinueWith(throwTsNodeError));
};

const handleJsOrTsConfigFile = configFile =>
  BbPromise.try(() => {
    if (!configFile.endsWith('.ts')) return null;
    return resolveTsNode(path.dirname(configFile)).then(tsNodePath => {
      try {
        require(tsNodePath).register();
      } catch (error) {
        throw new ServerlessError(
          `Registering "ts-node" failed with: ${error && error.stack ? error.stack : error}`
        );
      }
    });
  }).then(() => {
    try {
      return require(configFile);
    } catch (error) {
      throw new ServerlessError(
        `Loading ${configFile} failed with: ${error && error.stack ? error.stack : error}`
      );
    }
  });

const getServerlessConfigFile = memoizee(serverless =>
  getServerlessConfigFilePath(serverless).then(configFilePath => {
    if (!configFilePath) return null;
    const fileExtension = path.extname(configFilePath);
    const isJSOrTsConfigFile = fileExtension === '.js' || fileExtension === '.ts';

    return (isJSOrTsConfigFile
      ? handleJsOrTsConfigFile(configFilePath)
      : readFile(configFilePath)
    ).then(config => {
      if (_.isPlainObject(config)) return config;
      throw new ServerlessError(
        `${path.basename(configFilePath)} must export plain object`,
        'INVALID_CONFIG_OBJECT_TYPE'
      );
    });
  })
);

module.exports = { getConfigFilePath, getServerlessConfigFile, getServerlessConfigFilePath };
