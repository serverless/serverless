'use strict';

const retrocycle = require('json-decycle').retrocycle;
const YAML = require('js-yaml');


function parse(filePath, contents) {
  // Auto-parse JSON
  if (filePath.endsWith('.json')) {
    return JSON.parse(contents, retrocycle());
  } else if (filePath.endsWith('.yml') || filePath.endsWith('.yaml')) {
    return YAML.load(contents.toString(), { filename: filePath });
  }
  return contents.toString().trim();
}

module.exports = parse;
