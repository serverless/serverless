'use strict';

/**
 * Serverless: New Utilities
 * - Cleaner, stable utilities for plugin developers.
 * - Be sure to use fs-extra, instead of writing utilities, whenever possible
 */

require('shelljs/global');
let BbPromise     = require('bluebird'),
    rawDebug      = require('debug'),
    path          = require('path'),
    traverse      = require('traverse'),
    replaceall    = require('replaceall'),
    SError        = require('../Error'),
    SCli          = require('./cli'),
    dotenv        = require('dotenv'),
    fse           = BbPromise.promisifyAll(require('fs-extra')),
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
    if (match && match.length >= 2) {
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
      let stats = fse.statSync(path);
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
      let stats = fse.lstatSync(path);
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

    try {
      fse.mkdirsSync(path.dirname(filePath));
    } catch(e) {
      throw new SError(`Error creating parent folders when writing this file: ${filePath}
      ${e.message}`);
    }

    if (filePath.indexOf('.json') !== -1 && typeof contents !== 'string') {
      contents = JSON.stringify(contents, null, 2)
    }

    return fse.writeFileSync(filePath, contents);
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
      contents = fse.readFileSync(filePath);
    } catch(e) {
      throw new SError(`Error reading file ${filePath}
      ${e.message}`);
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
   * - Exports an object from a class instances
   * - Exports an object from any class instances
   */

  exportObject: function(data) {

    let convert = function(instance) {
      let obj = {};
      for (let i = 0; i < Object.keys(instance).length; i++) {
        let key = Object.keys(instance)[i];
        if (instance.hasOwnProperty(key) &&
            !key.startsWith('_') &&
            typeof instance[key] !== 'function') {
          obj[key] = instance[key];
        }
      }
      return obj;
    };

    data = { data: data };

    traverse(data).forEach(function (val) {
      if (val && val._class) {
        let newVal = convert(val);
        return this.update(newVal);
      }
    });

    return data.data;
  },

  /**
   * Generate Short ID
   */

  generateShortId: function(maxLen) {
    return shortid.generate().replace(/\W+/g, '').substring(0, maxLen).replace(/[_-]/g, '');
  },

  /**
   * Populate
   */

  populate: function(project, templates, data, stage, region) {

    // Validate required params
    if (!project || !templates || !data) throw new SError(`Missing required params: project, templates, data`);

    // Validate: Check stage exists
    if (stage) {
      if (!project.validateStageExists(stage)) throw new SError(`Stage doesn't exist`);
    }

    // Validate: Check region exists in stage
    if (stage && region) {
      if (!project.validateRegionExists(stage, region)) throw new SError(`Region "${region}" doesn't exist in provided stage "${stage}"`);
    }

    let varTemplateSyntax    = /\${([\s\S]+?)}/g,
        templateTemplateSyntax = /\$\${([\s\S]+?)}/g;

    if (project.variableSyntax) {
      varTemplateSyntax = RegExp(project.variableSyntax,'g');
    }

    if (project.templateSyntax) {
      templateTemplateSyntax = RegExp(project.templateSyntax,'g');
    }

    // Populate templates
    traverse(data).forEach(function (val) {

      let t = this;

      // check if the current string is a template
      if (typeof val === 'string' && val.match(templateTemplateSyntax) != null) {

        let template = val.replace(templateTemplateSyntax, (match, varName) => varName.trim());

        // Module name syntax deprecated notice.
        if (template.indexOf('.') !== -1) {
          SCli.log('DEPRECATED: Including the module name $${moduleName.template} is no longer supported.  ' +
              'Instead, all templates are use only the template name $${template} whether they are located in s-templates.json files in the project root or module root.  ' +
              'Module level templates extend project level templates if there are duplicates.  You will need to change: ' + template);
        }

        // Replace
        if (template in templates) {
          t.update(templates[template]);
        } else {
          SCli.log('WARNING: the following template is requested but not defined: ' + template + (data.name ? ' in ' + data.name : ''));
        }
      }
    });

    // Populate variables
    let variablesObject = project.getVariablesObject(stage, region);

    traverse(data).forEach(function(val) {

      let t = this;

      // check if the current string is a variable
      if (typeof(val) === 'string' && !val.match(templateTemplateSyntax) && val.match(varTemplateSyntax)) {

        // get all ${variable} in the string
        val.match(varTemplateSyntax).forEach(function(variableSyntax) {

          let variableName = variableSyntax.replace(varTemplateSyntax, (match, varName) => varName.trim());
          let value;

          if (variableName in variablesObject) {
            value = variablesObject[variableName];
          }

          // Reserved Variables
          if (variableName === 'name'         && data.name)         value = data.name;  // TODO Remove legacy variable that is semantically the functionName?
          if (variableName === 'functionName' && data.functionName) value = data.functionName;
          if (variableName === 'endpointName' && data.endpointName) value = data.endpointName;
          if (variableName === 'eventName'    && data.eventName)    value = data.eventName;

          // Populate
          if (!value && !value !== "") {
            SCli.log('WARNING: This variable is not defined: ' + variableName);
          } else if (typeof value === 'string') {

            // for string variables, we use replaceall in case the user
            // includes the variable as a substring (ie. "hello ${name}")
            val = replaceall(variableSyntax, value, val);
          } else {
            val = value;
          }
        });

        // Replace
        t.update(val);
      }
    });



    return data;
  },

  /**
   * NPM Install
   * - Programatically install NPM dependencies
   *
   * This function is here only for purpose of running testsuite.
   */

  npmInstall: function(dir) {
    process.chdir(dir);

    if (exec('npm install ', { silent: false }).code !== 0) {
      throw new SError(`Error executing NPM install on ${dir}`, SError.errorCodes.UNKNOWN);
    }

    process.chdir(process.cwd());
  },

  /**
   * Find Project Path
   */

  findProjectPath: function(startDir) {

    let _this = this;

    // Helper function
    let isProjectDir = function(dir) {
      let jsonName = 's-project.json';
      let jsonFilePath = path.join(dir, jsonName);

      if (_this.fileExistsSync(jsonFilePath)) {
        let projectJson = _this.readFileSync(jsonFilePath);
        if (typeof projectJson.name !== 'undefined') {
          return true;
        }
      }
      return false;
    };

    // Check up to 10 parent levels
    let previous  = '.',
        projectPath = undefined,
        i = 10;

    while( i >= 0 ) {
      let fullPath = path.resolve(startDir, previous);

      if( isProjectDir( fullPath ) ){
        projectPath = fullPath;
        break;
      }

      previous = path.join(previous, '..');
      i--;
    }

    return projectPath;
  },

  getFunctionsByCwd: function(allFunctions) {
    // we add a trailing slash to notate that it's the end of the folder name
    // this is just to avoid matching sub folder names that are substrings of other subfolder names
    let cwd = process.cwd() + path.sep,
        functions = [];

    allFunctions.forEach(function(func) {
      if (func.getFilePath().indexOf(cwd) != -1) functions.push(func);
    });

    // if no functions in cwd, add all functions
    if (functions.length === 0) functions = allFunctions;

    return functions;
  }

};
