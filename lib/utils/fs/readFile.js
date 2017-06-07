'use strict';

const YAML = require('js-yaml');
const fse = require('./fse');
const parse = require('./parse');

function readFile(filePath) {
  return fse.readFile(filePath, 'utf8')
    .then((contents) => parse(filePath, contents));
}

module.exports = readFile;
