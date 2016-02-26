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


  sDebugWithContext: function(context) {
    let debuggerCache = {};
    if (process.env.DEBUG) {
      context = `serverless:${context}`;
      if (!debuggerCache[context]) {
        debuggerCache[context] = rawDebug(context);
      }
      debuggerCache[context].apply(null, Array.prototype.slice.call(arguments, 1));
    }
  },

  sDebug: function() {
    if (process.env.DEBUG) {
      let caller  = this.getCaller();
      let context = this.pathToContext(caller);
      let args    = Array.prototype.slice.call(arguments);
      args.unshift(context);
      this.sDebugWithContext.apply(this, args);
    }
  },

  pathToContext: function(path) {
    // Match files under lib, tests, or bin so we only report the
    // Relevant part of the file name as the context
    let lPath = path.replace(/\\/g, '/');
    let pathRegex = /\/((lib|tests|bin)\/.*?)\.js$/i;
    let match     = pathRegex.exec(lPath);
    if (match.length >= 2) {
      return match[1].replace(/[\/\\]/g, '.');
    } else {
      return path;
    }
  },

  getCaller: function() {
    let stack = this.getStack();

    // Remove unwanted function calls on stack -- ourselves and our caller
    stack.shift();
    stack.shift();

    // Now the top of the stack is the CallSite we want
    // See this for available methods:
    //     https://code.google.com/p/v8-wiki/wiki/JavaScriptStackTraceApi
    let path = stack[0].getFileName();
    return path;
  },

  getStack: function() {
    // Save original Error.prepareStackTrace
    let origPrepareStackTrace = Error.prepareStackTrace;

    // Override with function that just returns `stack`
    Error.prepareStackTrace = function(_, stack) {
      return stack;
    };

    let err = new Error();

    // Get `err.stack`, which calls our new `Error.prepareStackTrace`
    let stack = err.stack;

    // Restore original `Error.prepareStackTrace`
    Error.prepareStackTrace = origPrepareStackTrace;

    // Remove ourselves from the stack
    stack.shift();

    return stack;
  },

  /**
   * Check Directory Exists Sync
   */

  dirExistsSync: function(path) {
    try {
      let stats = fs.statSync(path);
      return stats.isDirectory();
    }
    catch (e) {
      return false;
    }
  },

  /**
   * Check File Exists Sync
   */

  fileExistsSync: function(path) {
    try {
      let stats = fs.lstatSync(path);
      return stats.isFile();
    }
    catch (e) {
      return false;
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

    let parentDir = filePath.split(path.sep);
    parentDir.pop();
    parentDir = parentDir.join(path.sep);

    try {
      fse.mkdirsSync(parentDir);
    } catch(e) {
      throw new SError(`Could not create parent folders for: ${filePath}`);
    }

    if (filePath.indexOf('.json') !== -1 && typeof contents !== 'string') {
      contents = JSON.stringify(contents, null, 2)
    }

    return fs.writeFileSync(filePath, contents);
  },

  /**
   * Write File (Async)
   */

  writeFile: function(filePath, contents) {
    let _this = this;
    return new BbPromise(function(resolve, reject) {
      try {
        _this.writeFileSync(filePath, contents);
      } catch(e) {
        reject(e);
      }
      resolve();
    });
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
    if (filePath.endsWith('.json')) {
      try {
        contents = JSON.parse(contents);
      } catch(e) {
        throw new SError(`Could not parse JSON in file: ${filePath}`);
      }
    }

    return contents;
  },

  /**
   * Read File (Async)
   */

  readFile: function(filePath) {
    let _this = this, contents;
    return new BbPromise(function(resolve, reject) {
      try {
        contents = _this.readFileSync(filePath);
      } catch(e) {
        reject(e);
      }
      resolve(contents);
    });
  },

  /**
   * Export Object
   * - Exports an object from a class
   */

  exportObject: function(data) {

    let convert = function(instance) {
      let obj = {};
      for (let i = 0; i < Object.keys(instance).length; i++) {
        let key = Object.keys(instance)[i];
        if (!key.startsWith('_') &&
        typeof instance[key] !== 'function') {
          obj[key] = instance[key];
        }
      }
      return obj;
    };

    traverse({ data: data }).forEach(function (val) {
      if (val && val._class) {
        let newVal = convert(val);
        return this.update(newVal);
      }
    });
    console.log("here", data);
    return data;
  },

  /**
   * Generate Short ID
   */

  generateShortId: function(maxLen) {
    return shortid.generate().replace(/\W+/g, '').substring(0, maxLen).replace(/[_-]/g, '');
  },

  persistentRequest: function(f) {
    let _this = this;

    return new BbPromise(function(resolve, reject){
      let doCall = function(){
        f()
          .then(resolve)
          .catch(function(error) {

            if( error.statusCode == 429 ) {
              _this.sDebug("'Too many requests' received, sleeping 5 seconds");
              setTimeout( doCall, 5000 );
            } else
              reject( error );
          });
      };
      return doCall();
    });
  }
};