'use strict';

const SError     = require('./Error'),
  BbPromise    = require('bluebird'),
  fs           = require('fs'),
  path         = require('path');

/**
 * This is the base class that all Serverless Runtimes should extend.
 */


let SUtils;

class ServerlessRuntimeBase {
  constructor(S, name) {

    SUtils = S.utils;

    this.S      = S;
    this.name   = name;
  }

  populateComponentFolder( componentPath ) {
    return BbPromise.reject(new SError(`Runtime ${this.name} should implement populateComponentFolder()`));
  }

  populateFunctionFolder( fnRootPath, fnFullPath ) {
    return BbPromise.reject(new SError(`Runtime ${this.name} should implement populateFunctionFolder()`));
  }

  installDepedencies( dir ) {
    return BbPromise.reject(new SError(`Runtime ${this.name} should implement installDepedencies()`));
  }

  getFunctionRunActionName() {
    throw new SError(`Runtime ${this.name} should implement getFunctionRunAction()`);
  }

  // Helper methods for derived classes

  getName(){
    return this.name;
  }

  copyFileFromTemplate(from, to, transform) {
    from = path.join.apply( path, from );
    to = path.join.apply( path, to );

    let content = fs.readFileSync(path.join(this.S.config.serverlessPath, 'templates', this.name, from));

    if( transform ){
      content = transform( content );
    }

    SUtils.writeFile(to, content);
  };
}

module.exports = ServerlessRuntimeBase;
