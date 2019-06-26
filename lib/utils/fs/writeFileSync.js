'use strict';

const fse = require('./fse');
const path = require('path');
const jc = require('json-cycle');
const YAML = require('js-yaml');

function writeFileSync(filePath, conts, cycles) {
  let contents = conts || '';

  fse.mkdirsSync(path.dirname(filePath));

  if (filePath.indexOf('.json') !== -1 && typeof contents !== 'string') {
    if (cycles) {
      contents = jc.stringify(contents, null, 2);
    } else {
      contents = JSON.stringify(contents, null, 2);
    }
  }

  const yamlFileExists = filePath.indexOf('.yaml') !== -1;
  const ymlFileExists = filePath.indexOf('.yml') !== -1;

  if ((yamlFileExists || ymlFileExists) && typeof contents !== 'string') {
    contents = YAML.dump(contents);
  }

  return fse.writeFileSync(filePath, contents);
}

module.exports = writeFileSync;
