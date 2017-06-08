'use strict';

const fse = require('./fse');
const parse = require('./parse');

function readFile(filePath) {
  return fse.readFileAsync(filePath, 'utf8')
    .then((contents) => parse(filePath, contents));
}

module.exports = readFile;
