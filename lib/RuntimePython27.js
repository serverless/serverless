'use strict';

const SError     = require('./Error'),
  SCli         = require('./utils/cli'),
  RuntimeBase  = require('./RuntimeBase'),
  BbPromise    = require('bluebird'),
  path         = require('path'),
  _            = require('lodash'),
  fs           = require('fs');

/**
 * Pip install using prefix strategy (not virtualenv), requires a modern `pip` version
 */
function pipPrefixInstall(requirements, dir) {
  if (exec(`pip install -t "${dir}" -r "${requirements}"`, { silent: false }).code !== 0) {
    throw new SError(`Error executing pip install on ${dir}`, SError.errorCodes.UNKNOWN);
  }

  process.chdir(process.cwd());
};

let SUtils;

class ServerlessRuntimePython27 extends RuntimeBase {
  constructor(S) {
    super( S, 'python2.7' );

    SUtils = S.utils;
  }


  getFunctionRunActionName() {
    return 'functionRunLambdaPython2';
  }

  installDepedencies( dir ) {
    SCli.log("Installing default python dependencies with pip...");
    SCli.log(`-----------------`);
    pipPrefixInstall(
      this.S.getProject().getFilePath( dir, 'requirements.txt'),
      this.S.getProject().getFilePath( dir, 'vendored')
    );
    SCli.log(`-----------------`);
  }
}

module.exports = ServerlessRuntimePython27;
