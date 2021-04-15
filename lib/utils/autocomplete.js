'use strict';

const Serverless = require('../Serverless');
const crypto = require('crypto');

const resolveConfigurationPath = require('../../lib/cli/resolve-configuration-path');
const readConfiguration = require('../../lib/configuration/read');
const getCacheFile = require('./getCacheFile');

const getSuggestions = (commands, env) => {
  if (!env.complete) return;
  const tokens = env.line.split(/\s+/);
  const { log } = require('tabtab');
  switch (tokens.length) {
    case 1:
    case 2:
      log(Object.keys(commands).filter((commandName) => !commands[commandName].isHidden));
      return;
    case 3:
      if (commands[env.prev]) log(commands[env.prev]);
      return;
    default:
      return;
  }
};

const cacheFileValid = (configurationInput, validationHash) => {
  const serverlessConfigFileHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(configurationInput))
    .digest('hex');

  return validationHash === serverlessConfigFileHash;
};

const autocomplete = async () => {
  const configurationPath = await resolveConfigurationPath();
  const serviceDir = process.cwd();
  const configurationInput = configurationPath
    ? await (async () => {
        try {
          return await readConfiguration(configurationPath);
        } catch (error) {
          return null;
        }
      })()
    : null;
  let cacheFile = await getCacheFile(serviceDir);
  if (!cacheFile || !cacheFileValid(configurationInput, cacheFile.validationHash)) {
    const serverless = new Serverless();
    await serverless.init();
    cacheFile = await getCacheFile(serviceDir);
  }
  if (!cacheFile || !cacheFileValid(configurationInput, cacheFile.validationHash)) {
    return null;
  }
  return getSuggestions(cacheFile.commands, require('tabtab').parseEnv(process.env));
};

module.exports = autocomplete;
