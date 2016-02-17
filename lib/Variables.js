'use strict';

const SError   = require('./Error'),
  SUtils       = require('./utils/index'),
  fs           = require('fs'),
  _            = require('lodash'),
  BbPromise    = require('bluebird');

/**
 * This is the class which holds a set of variables and know how to operate on them
 */

class ServerlessVarContainer {
  constructor(S, parent, vars) {
    this._S = S;
    this._parent = parent;
    this._variables = _.extend({}, vars);
  }

  getVars(){
    let res = _.extend( {}, vars );

    if( this._parent ){
      res = _.extend( res, parent.getVars() );
    }

    return res;
  }

  getVar( name ){
    return this.getVars()[ name ];
  }

  loadVarsFromFile( file ){
    this._variables = SUtils.readAndParseJsonSync( this._S.getProject().getFilePath( '_meta', 'variables', file ));
  }

  saveVarsToFile( file ){
    let _this = this;

    if (!SUtils.dirExistsSync(_this._S.getProject().getFilePath('_meta'))) {
      fs.mkdirSync(_this._S.getProject().getFilePath('_meta'));
    }

    // Create meta/variables folder, if does not exist
    if (!SUtils.dirExistsSync(_this._S.getProject().getFilePath('_meta', 'variables'))) {
      fs.mkdirSync(_this._S.getProject().getFilePath('_meta', 'variables'));
    }

    // Save Common Variables
    fs.writeFileSync(_this._S.getProject().getFilePath('_meta', 'variables', file), JSON.stringify(this._variables, null, 2));
  }
}

module.exports = ServerlessVarContainer;
