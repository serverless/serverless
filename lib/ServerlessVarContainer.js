'use strict';

const SError     = require('./ServerlessError'),
  SUtils       = require('./utils/index'),
  BbPromise    = require('bluebird');

/**
 * This is the class which holds a set of variables and know how to operate on them
 */

class ServerlessVarContainer {
  constructor(S, parent) {
    this._S = S;
    this._parent = parent;
    this._variables = {};
  }

  loadVarsFromFile( file ){
    _this.variables = SUtils.readAndParseJsonSync( _this._S.getProject().getFilePath( '_meta', 'variables',  file ));
  }

  saveVarsToFile( file ){

  }
}

module.exports = ServerlessVarContainer;
