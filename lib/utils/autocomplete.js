'use strict';

const homedir = require('os').homedir();
const readFileSync = require('./fs/readFileSync');
const fileExistsSync = require('./fs/fileExistsSync');

const tab = require('tabtab')({
  name: 'serverless',
});

const autocomplete = () => {
  const cacheFilePath = `${homedir}/.serverless/autocomplete.json`;
  if (!fileExistsSync(cacheFilePath)) {
    return;
  }
  const cacheFile = readFileSync(cacheFilePath);

  tab.on('serverless', (data, done) => {
    done(null, Object.keys(cacheFile));
  });

  Object.keys(cacheFile).forEach(command => {
    tab.on(command, (data, done) => {
      done(null, cacheFile[command]);
    });
  });

  tab.start();
};

module.exports = autocomplete;
