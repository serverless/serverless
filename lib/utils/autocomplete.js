'use strict';

const Serverless = require('../Serverless');
const crypto = require('crypto');

const getCacheFile = require('./getCacheFile');
const getServerlessConfigFile = require('./getServerlessConfigFile');

const tab = require('tabtab')({
  name: 'serverless',
});

const tabSls = require('tabtab')({
  name: 'sls',
});

const getSugestions = (commands) => {
  tab.on('serverless', (data, done) => {
    done(null, Object.keys(commands));
  });

  tabSls.on('sls', (data, done) => {
    done(null, Object.keys(commands));
  });

  Object.keys(commands).forEach(command => {
    tab.on(command, (data, done) => {
      done(null, commands[command]);
    });
    tabSls.on(command, (data, done) => {
      done(null, commands[command]);
    });
  });

  tab.start();
  tabSls.start();
};

const cacheFileValid = (serverlessConfigFile, validationHash) => {
  const serverlessConfigFileHash = crypto.createHash('sha256')
    .update(JSON.stringify(serverlessConfigFile)).digest('hex');
  if (validationHash === serverlessConfigFileHash) return true;
  return false;
};

const autocomplete = () => {
  let servicePath = process.cwd();
  const serverlessConfigFile = getServerlessConfigFile(servicePath);

  if (!serverlessConfigFile) {
    servicePath = 'x';
  }

  const cacheFile = getCacheFile(servicePath);

  if (!cacheFile || !cacheFileValid(serverlessConfigFile, cacheFile.validationHash)) {
    const serverless = new Serverless();
    return serverless.init().then(() => getSugestions(cacheFile.commands));
  }

  return getSugestions(cacheFile.commands);
};

module.exports = autocomplete;
