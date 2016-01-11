'use strict';

/**
 * Serverless State Class
 */

const SError       = require('./ServerlessError'),
  SUtils           = require('./utils/index'),
  _                = require('lodash'),
  path             = require('path'),
  fs               = require('fs'),
  BbPromise        = require('bluebird');

class ServerlessState
{

  /**
   * Constructor
   */

  constructor(Serverless) {
    this.S       = Serverless;
    this.load();
  }

  /**
   * Load
   * - Load from source (i.e., file system);
   */

  load() {
    this.data = {
      meta:     this.S.classes.Meta(this.S),
      project:  this.S.classes.Project(this.S)
    }
  }

  /**
   * Get
   * - Returns clone of data
   */

  get() {
    return _.cloneDeep(this.data);
  }

  /**
   * Set
   * - Set data
   */

  set(data) {
    this.data = _.merge(this.data, data);
  }
}

module.exports = ServerlessMeta;