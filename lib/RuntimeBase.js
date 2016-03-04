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

}

module.exports = ServerlessRuntimeBase;
