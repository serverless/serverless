'use strict';

const fse = require('fs-extra');
const parse = require('./parse');

async function readFile(filePath) {
  return fse.readFile(filePath, 'utf8').then((contents) => parse(filePath, contents));
}

module.exports = readFile;
