'use strict';

const fse = require('fs-extra');
const parse = require('./parse');

function readFileSync(filePath) {
  const contents = fse.readFileSync(filePath);
  return parse(filePath, contents);
}

module.exports = readFileSync;
