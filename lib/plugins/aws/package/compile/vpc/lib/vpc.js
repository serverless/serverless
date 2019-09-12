'use strict';

const BbPromise = require('bluebird');

function compileVpc() {
  console.log('Compiling VPC...');
  return BbPromise.resolve();
}

module.exports = { compileVpc };
