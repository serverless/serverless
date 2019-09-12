'use strict';

const BbPromise = require('bluebird');

function compileInternetGateway() {
  console.log('Compiling Internet Gateway...');
  return BbPromise.resolve();
}

module.exports = { compileInternetGateway };
