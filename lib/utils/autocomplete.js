'use strict';

const path = require('path');

const Serverless = require('../Serverless');
const crypto = require('crypto');

const getCacheFile = require('./getCacheFile');
const getServerlessConfigFile = require('./getServerlessConfigFile');

const name = path.basename(process.argv[0]);

const tab = require('tabtab')({ name });

const getSuggestions = (commands) => {
  tab.on(name, (data, done) => {
    if (data.words === 1) {
      done(null, Object.keys(commands));
    } else {
      done(null, []);
    }
  });

  Object.keys(commands).forEach(command => {
    tab.on(command, (data, done) => {
      done(null, commands[command]);
    });
  });

  tab.start();
};

const cacheFileValid = (serverlessConfigFile, validationHash) => {
  const serverlessConfigFileHash = crypto.createHash('sha256')
    .update(JSON.stringify(serverlessConfigFile)).digest('hex');
  if (validationHash === serverlessConfigFileHash) {
    return true;
  }
  return false;
};

const autocomplete = () => {
  let servicePath = process.cwd();
  return getServerlessConfigFile(servicePath)
    .then((serverlessConfigFile) => {
      if (!serverlessConfigFile) {
        servicePath = 'x';
      }
      return getCacheFile(servicePath)
        .then((cacheFile) => {
          if (!cacheFile || !cacheFileValid(serverlessConfigFile, cacheFile.validationHash)) {
            const serverless = new Serverless();
            return serverless.init().then(() => getCacheFile(servicePath));
          }
          return cacheFile;
        })
        .then((cacheFile) => {
          if (!cacheFile || !cacheFileValid(serverlessConfigFile, cacheFile.validationHash)) {
            return;
          }
          return getSuggestions(cacheFile.commands); // eslint-disable-line consistent-return
        });
    });
};

module.exports = autocomplete;
