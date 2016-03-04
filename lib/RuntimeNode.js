'use strict';

const SError   = require('./Error'),
  RuntimeBase  = require('./RuntimeBase'),
  SCli         = require('./utils/cli'),
  _            = require('lodash'),
  BbPromise    = require('bluebird');

let SUtils;

class ServerlessRuntimeNode extends RuntimeBase {
  constructor(S) {
    super( S, 'nodejs' );

    SUtils = S.utils;
  }

  getFunctionRunActionName() {
    return 'functionRunLambdaNodeJs';
  }

  installDepedencies( dir ) {
    SCli.log('Installing "serverless-helpers" for this component via NPM...');
    SCli.log(`-----------------`);
    SUtils.npmInstall(this.S.getProject().getRootPath(dir));
    SCli.log(`-----------------`);
  }
}

module.exports = ServerlessRuntimeNode;
