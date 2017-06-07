'use strict';

const YAML = require('js-yaml');
const fse = require('./fse');
const parse = require('./parse');

function readFileSync(filePath) {
  let contents = fse.readFileSync(filePath);
  return parse(filePath, contents);
}

module.exports = readFileSync;
