'use strict';

const decycle = require('json-decycle').decycle;

function stringify(contents) {
  return JSON.stringify(contents, decycle(), 2);
}

module.exports = stringify;
