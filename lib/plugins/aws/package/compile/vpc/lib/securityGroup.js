'use strict';

const BbPromise = require('bluebird');

function compileSecurityGroup() {
  console.log('Compiling Security Group...');
  return BbPromise.resolve();
}

module.exports = { compileSecurityGroup };
