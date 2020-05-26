'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');
const path = require('path');
const resolveModulePath = require('ncjsm/resolve');
const spawn = require('child-process-ext/spawn');
const fileExists = require('./fs/fileExists');
const readFile = require('./fs/readFile');
const ServerlessError = require('../classes/Error').ServerlessError;

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

const requireTsNode = serviceDir => {
  const requireOrThrow = (...args) =>
    resolveModulePath(...args).then(result => {
      // the resolved module path is sometimes null instead of throwing MODULE_NOT_FOUND
      if (!result) {
        const error = new Error(`Cannot find module '${args[1]}'`);
        error.code = 'MODULE_NOT_FOUND';
        throw error;
      }
      // if there is a symlink, we need to extra 'realPath' from the return object
      const pathString = typeof result === 'string' ? result : result.realPath;
      return require(pathString);
    });

  const createOnError = cb => error => {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    return cb();
  };

  const resolveAsServerlessPeerDependency = () => requireOrThrow(__dirname, 'ts-node');
  const resolveAsServiceDependency = () => requireOrThrow(serviceDir, 'ts-node');
  const resolveAsGlobalInstallation = () =>
    spawn('npm', ['root', '-g']).then(({ stdoutBuffer }) => {
      return requireOrThrow('/', `${String(stdoutBuffer).trim()}/ts-node`);
    });
  const throwTsNodeError = () => {
    throw new ServerlessError(
      'Ensure "ts-node" dependency when working with TypeScript configuration files'
    );
  };

  return resolveAsServerlessPeerDependency()
    .catch(createOnError(resolveAsServiceDependency))
    .catch(createOnError(resolveAsGlobalInstallation))
    .catch(createOnError(throwTsNodeError));
};

const handleJsOrTsConfigFile = configFile =>
  BbPromise.try(() => {
    if (configFile.endsWith('.ts')) {
      return requireTsNode(path.dirname(configFile)).then(tsNode => {
        tsNode.register();
        return require(configFile);
      });
    }
    return require(configFile);
  }).then(config => {
    if (_.isPlainObject(config)) {
      return config;
    }
    throw new Error(`${path.basename(configFile)} must export plain object`);
  });

const getServerlessConfigFile = _.memoize(
  serverless =>
    getServerlessConfigFilePath(serverless).then(configFilePath => {
      if (configFilePath !== null) {
        const fileExtension = _.last(_.split(configFilePath, '.'));
        const isJSOrTsConfigFile = fileExtension === 'js' || fileExtension === 'ts';

        if (isJSOrTsConfigFile) {
          return handleJsOrTsConfigFile(configFilePath);
        }

        return readFile(configFilePath).then(result => result || {});
      }

      return '';
    }),
  serverless => `${serverless.processedInput.options.config} - ${serverless.config.servicePath}`
);

module.exports = { getConfigFilePath, getServerlessConfigFile, getServerlessConfigFilePath };
