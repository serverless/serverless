'use strict';

const readFileSync = require('./fs/readFileSync');
const fileExistsSync = require('./fs/fileExistsSync');
const getCacheFilePath = require('./getCacheFilePath');
const serverlessConfigFileExists = require('./serverlessConfigFileExists');

const tab = require('tabtab')({
  name: 'serverless',
});

const autocomplete = () => {
  let servicePath = process.cwd();

  if (!serverlessConfigFileExists(servicePath)) {
    servicePath = 'x';
  }

  const cacheFilePath = getCacheFilePath(servicePath);

  if (!fileExistsSync(cacheFilePath)) {
    return;
  }
  const cacheFile = readFileSync(cacheFilePath);

  tab.on('serverless', (data, done) => {
    done(null, Object.keys(cacheFile.commands));
  });

  Object.keys(cacheFile.commands).forEach(command => {
    tab.on(command, (data, done) => {
      done(null, cacheFile.commands[command]);
    });
  });

  tab.start();
};

module.exports = autocomplete;
