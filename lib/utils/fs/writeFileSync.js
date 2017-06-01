'use strict';

const path = require('path');
const YAML = require('js-yaml');
const fse = require('./fse');

function writeFileSync(filePath, conts) {
  let contents = conts || '';

  fse.mkdirsSync(path.dirname(filePath));

  if (filePath.indexOf('.json') !== -1 && typeof contents !== 'string') {
    contents = JSON.stringify(contents, null, 2);
  }

  const yamlFileExists = (filePath.indexOf('.yaml') !== -1);
  const ymlFileExists = (filePath.indexOf('.yml') !== -1);

  if ((yamlFileExists || ymlFileExists) && typeof contents !== 'string') {
    contents = YAML.dump(contents);
  }

  return fse.writeFileSync(filePath, contents);
}

module.exports = writeFileSync;
