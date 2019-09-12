'use strict';

const BbPromise = require('bluebird');

function compilePrivateSubnets() {
  console.log('Compiling Private Subnets...');
  return BbPromise.resolve();
}

module.exports = { compilePrivateSubnets };
