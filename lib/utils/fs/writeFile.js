'use strict';

const path = require('path');
const YAML = require('js-yaml');
const fse = require('./fse');

function writeFile(filePath, conts) {
  let contents = conts || '';

  return fse.mkdirsAsync(path.dirname(filePath))
    .then(() => {
      if (filePath.indexOf('.json') !== -1 && typeof contents !== 'string') {
        contents = JSON.stringify(contents, null, 2);
      }

      const yamlFileExists = (filePath.indexOf('.yaml') !== -1);
      const ymlFileExists = (filePath.indexOf('.yml') !== -1);

      if ((yamlFileExists || ymlFileExists) && typeof contents !== 'string') {
        contents = YAML.dump(contents);
      }

      return fse.writeFileAsync(filePath, contents);
    });
}

module.exports = writeFile;
