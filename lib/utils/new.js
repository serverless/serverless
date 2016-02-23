'use strict';

/**
 * Serverless: New Utilities
 * - Cleaner, stable utilities for plugin developers.
 * - Be sure to use fs-extra, instead of writing utilities, whenever possible
 */

require('shelljs/global');
let BbPromise   = require('bluebird'),
  rawDebug      = require('debug'),
  path          = require('path'),
  async         = require('async'),
  traverse      = require('traverse'),
  readdirp      = require('readdirp'),
  replaceall    = require('replaceall'),
  SError        = require('../Error'),
  SCli          = require('./cli'),
  dotenv        = require('dotenv'),
  fs            = require('fs'),
  fse            = require('fs-extra'),
  _             = require('lodash'),
  shortid       = require('shortid');


module.exports = {

  /**
   * Serverless Debug
   */

  sDebug:function() {

    if (process.env.DEBUG) {
      let caller  = getCaller();
      let context = pathToContext(caller);
      let args    = Array.prototype.slice.call(arguments);
      args.unshift(context);
      this.sDebugWithContext.apply(this, args);
    }
  },

  /**
   * Write File Sync
   */

  writeFileSync: function(filePath, contents) {

    this.sDebug(`Writing file: ${filePath}...`);

    if (contents === undefined) {
      contents = '';
    }

    let parentDir = filePath.split('/');
    parentDir.pop();
    parentDir = parentDir.join('/');

    try {
      fse.mkdirsSync(parentDir);
    } catch(e) {
      throw new SError(`Could not create parent folders for: ${filePath}`);
    }

    return fs.writeFileSync(filePath, contents);
  },

  /**
   * Read File Sync
   * - Reads file from file system
   * - Auto-parses JSON and throws error if invalid JSON
   */

  readFileSync: function(filePath) {

    let contents;

    this.sDebug(`Reading file: ${filePath}...`);

    // Read file
    try {
      contents = fs.readFileSync(filePath);
    } catch(e) {
      throw new SError(`Error reading file ${filePath}`);
    }

    // Auto-parse JSON
    try {
      contents = JSON.parse(contents);
    } catch(e) {
      throw new SError(`Could not parse JSON in file: ${filePath}`);
    }

    return contents;
  },



  /**
   * Export Object
   * - Exports an object from a class
   */

  exportObject: function(data) {
    traverse(data).forEach(function (val) {
      if (this.key && this.key.startsWith('_')) this.remove(true);
      if (typeof val === 'function') this.remove(true);
    });
    return data;
  },

  /**
   * Generate Short ID
   */

  generateShortId: function(maxLen) {
    return shortid.generate().replace(/\W+/g, '').substring(0, maxLen).replace(/[_-]/g, '');
  }

};