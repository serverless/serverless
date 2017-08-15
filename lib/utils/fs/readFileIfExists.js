const fileExists = require('./fileExists');
const readFile = require('./readFile');
const BbPromise = require('bluebird');

const readFileIfExists = function (filePath) {
  return fileExists(filePath)
    .then((exists) => {
      if (!exists) {
        return BbPromise.resolve(false);
      }
      return readFile(filePath);
    });
};

module.exports = readFileIfExists;
