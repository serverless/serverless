'use strict';

const BbPromise = require('bluebird');

function compilePublicSubnets() {
  console.log('Compiling Public Subnets...');
  return BbPromise.resolve();
}

module.exports = { compilePublicSubnets };
