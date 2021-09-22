'use strict';

const fsp = require('fs').promises;
const parse = require('./parse');

async function readFile(filePath) {
  return fsp.readFile(filePath, 'utf8').then((contents) => parse(filePath, contents));
}

module.exports = readFile;
