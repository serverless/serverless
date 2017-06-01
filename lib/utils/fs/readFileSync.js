'use strict';

const YAML = require('js-yaml');
const fse = require('./fse');

function readFileSync(filePath) {
  let contents;

  // Read file
  contents = fse.readFileSync(filePath);

  // Auto-parse JSON
  if (filePath.endsWith('.json')) {
    contents = JSON.parse(contents);
  } else if (filePath.endsWith('.yml') || filePath.endsWith('.yaml')) {
    contents = YAML.load(contents.toString(), { filename: filePath });
  } else {
    contents = contents.toString().trim();
  }

  return contents;
}

module.exports = readFileSync;
