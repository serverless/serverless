'use strict';

const Serverless = require('../Serverless');
const crypto = require('crypto');

const getCacheFile = require('./getCacheFile');
const getServerlessConfigFile = require('./getServerlessConfigFile').getServerlessConfigFile;

const getSuggestions = (commands, env) => {
  if (!env.complete) return;
  const tokens = env.line.split(/\s+/);
  const { log } = require('tabtab');
  switch (tokens.length) {
    case 1:
    case 2:
      log(Object.keys(commands));
      return;
    case 3:
      if (commands[env.prev]) log(commands[env.prev]);
      return;
    default:
      return;
  }
};

const cacheFileValid = (serverlessConfigFile, validationHash) => {
  const serverlessConfigFileHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(serverlessConfigFile))
    .digest('hex');
  if (validationHash === serverlessConfigFileHash) {
    return true;
  }
  return false;
};

const autocomplete = () => {
  const servicePath = process.cwd();
  return getServerlessConfigFile({ processedInput: { options: {} }, config: { servicePath } }).then(
    serverlessConfigFile =>
      getCacheFile(servicePath)
        .then(cacheFile => {
          if (!cacheFile || !cacheFileValid(serverlessConfigFile, cacheFile.validationHash)) {
            const serverless = new Serverless();
            return serverless.init().then(() => getCacheFile(servicePath));
          }
          return cacheFile;
        })
        .then(cacheFile => {
          if (!cacheFile || !cacheFileValid(serverlessConfigFile, cacheFile.validationHash)) {
            return null;
          }
          return getSuggestions(cacheFile.commands, require('tabtab').parseEnv(process.env));
        })
  );
};

module.exports = autocomplete;
