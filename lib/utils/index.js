'use strict';

/**
 * Serverless: Utilities
 */

require('shelljs/global');
let BbPromise   = require('bluebird'),
  rawDebug      = require('debug'),
  path          = require('path'),
  async         = require('async'),
  traverse      = require('traverse'),
  readdirp      = require('readdirp'),
  replaceall    = require('replaceall'),
  SError        = require('../ServerlessError'),
  SCli          = require('./cli'),
  fs            = require('fs'),
  mkdirpAsync   = require('mkdirp-then'),
  shortid       = require('shortid');

BbPromise.promisifyAll(fs);

/**
 * Supported Runtimes
 */

module.exports.supportedRuntimes = {
  "nodejs": require('../ServerlessRuntimeNode'),
  "python2.7": require('../ServerlessRuntimePython27')
};

/**
 * Export Class Data
 */

exports.exportClassData = function(data) {
  for (let prop in data) {

    // Remove private properties
    if (data.hasOwnProperty(prop) && prop.startsWith('_')) delete data[prop];

    // Remove methods
    if (typeof prop === 'function') delete data[prop];
  }

  return data;
};

/**
 * Build sPath
 */

exports.buildSPath = function(data) {
  let path                 = '';
  if (data.component)      path = path + data.component.trim();
  if (data.cPath)          path = path + '/' + data.cPath.trim();
  if (data.function)       path = path + '/' + data.function.trim();
  if (data.endpointPath)   path = path + '@' + data.endpointPath.trim();
  if (data.endpointMethod) path = path + '~' + data.endpointMethod.trim();
  return path;
};

/**
 * Parse sPath
 */

exports.parseSPath = function(sPath) {
  let pArray    = sPath.split('/');
  if (pArray.length < 1) {
    return { component: pArray[0] }
  } else {
    let parsed = {
      component: pArray[0],
      function:  pArray[1] ? pArray[pArray.length - 1].split('@')[0] : null,
      urlPath:   pArray[1] ? pArray[pArray.length - 1].split('@')[1] ? pArray[pArray.length - 1].split('@')[1].split('~')[0] : null : null,
      urlMethod: pArray[1] ? pArray[pArray.length - 1].split('@')[1] ? pArray[pArray.length - 1].split('@')[1].split('~')[1] : null : null,
      event:     pArray[1] ? pArray[pArray.length - 1].split('#')[1] : null
    };
    pArray.shift();
    pArray.pop();
    // Check for any cPath
    if (pArray.length) {
      parsed.cPath = pArray.join('/');
    }
    return parsed;
  }
};

/**
 * Read Recursively
 */

exports.readRecursively = function(path, filter) {
  return new BbPromise(function(resolve, reject) {

    let files = [];

    readdirp({
      root:       path,
      fileFilter: filter
    })
      .on('data', function(entry) {
        files.push(entry.path);
      })
      .on('error', function(error) {
        reject(error);
      })
      .on('end', function() {
        resolve(files);
      });
  });
};

/**
 * Return Partial
 */

exports.returnPartial = function(string, symbol, number, defaultResponse) {
  if (string.indexOf(symbol) > -1) return string.split(symbol)[number];
  else return defaultResponse;
};

/**
 * Get Endpoints
 * - Return endpoint JSONs
 * - If no paths specified, finds all endpoints in baseDir
 * - Each endpoint must contain #, @ and ~ in path:  module/function#get@get-data~GET
 */

exports.getEndpoints = function(baseDir, endpointPaths) {

  let _this = this,
    allEndpointJsons = [];

  return BbPromise.try(function () {

      // Sanitize baseDir
      if ((baseDir).indexOf('/back') == -1)    baseDir = path.join(baseDir, 'back');
      if ((baseDir).indexOf('/modules') == -1) baseDir = path.join(baseDir, 'modules');

      // If endpointPaths, validate and return them
      if (endpointPaths) {

        // Validate - ensure endpoint path contains #
        for (let i = 0; i < endpointPaths.length; i++) {
          let path = endpointPaths[i];

          // Ensure pointers are included
          if (path.indexOf('#') === -1 || path.indexOf('@') === -1 || path.indexOf('~') === -1) {
            throw new SError(`Endpoint path is missing '#', '@' or '~' : ${path}`,
              SError.errorCodes.INVALID_RESOURCE_NAME);
          }

          // If absolute path, trim to be relative
          if (path.indexOf('/back/modules') === -1) {
            path = path.split('back/modules/')[1];
          }
        }

        return endpointPaths;
      }

      // If no endpointPaths, get all functions in project and create their endpoint paths
      endpointPaths = [];
      return _this.readRecursively(baseDir, '*s-function.json')
        .then(function(functionFilePaths) {

          // If inside modules, grab path prefix
          let baseArray = baseDir.split(path.sep),
            pathPrefix;
          if (baseArray[baseArray.indexOf('modules') + 1]) {
            pathPrefix = (baseArray.splice(baseArray.indexOf('modules') + 1)).join(path.sep);
          }

          // We've used the basDir to locate functions.  Now, normalize baseDir
          if (baseDir.indexOf('modules/') > -1)  baseDir = path.join(baseDir.split('modules/')[0], 'modules/');
          if (baseDir.indexOf('modules\\') > -1) baseDir = path.join(baseDir.split('modules\\')[0], 'modules\\'); // Windows

          for (let i = 0; i < functionFilePaths.length; i++) {

            // Read JSON
            let filePath        = pathPrefix ? path.join(pathPrefix, functionFilePaths[i]) : functionFilePaths[i];
            let functionsObject = _this.readAndParseJsonSync(path.join(baseDir, filePath));
            functionsObject     = functionsObject.functions;

            // Create paths for each function in s-function.json
            for (let j = 0; j < Object.keys(functionsObject).length; j++ ) {

              let functionPath = filePath + '#' + Object.keys(functionsObject)[j];
              let funcObject = functionsObject[Object.keys(functionsObject)[j]];

              for (let k = 0; k < funcObject.endpoints.length; k++) {
                let endpointPath = functionPath + '@' + funcObject.endpoints[k].path + '~' + funcObject.endpoints[k].method;
                endpointPaths.push(endpointPath);
              }
            }
          }

          return endpointPaths;
        });
    })
    .then(function(paths) {

      // Sanitize Paths
      for (let i = 0; i < paths.length; i++) {

        paths[i] = paths[i].replace('s-function.json', '');
        paths[i] = paths[i].replace('/#', '#');
        paths[i] = paths[i].replace('\\#', '#');

        // Remove slashes after functionPath
        if (['/', '\\'].indexOf(paths[i].charAt(0)) !== -1) paths[i] = paths[i].substring(1, paths[i].length);
      }

      return paths;
    })
    .then(function(endpointPaths) {
      return new BbPromise(function(resolve, reject){

        // Loop through function paths and process
        async.eachLimit(endpointPaths, 10, function (pathEndpoint, cb) {

          let pathFunctionRelative  = null,
            nameFunction          = null,
            endpointUrlPath       = null,
            endpointMethod        = null;

          // Get Function Properties
          pathFunctionRelative  = _this.returnPartial(pathEndpoint, '@', 0, null);
          nameFunction          = _this.returnPartial(pathFunctionRelative, '#', 1, null);
          pathFunctionRelative  = _this.returnPartial(pathFunctionRelative, '#', 0, null);

          // Get Endpoint Properties
          endpointUrlPath  = _this.returnPartial(pathEndpoint, '@', 1, null);
          endpointMethod   = _this.returnPartial(pathEndpoint, '~', 1, null);
          endpointUrlPath  = _this.returnPartial(endpointUrlPath, '~', 0, null);

          // If endpointPath has s-function.json missing, add it
          pathEndpoint = pathEndpoint.replace('s-function.json', '');

          // Check function exists
          if (!_this.fileExistsSync(path.join(baseDir, pathFunctionRelative, 's-function.json'))) {
            throw new SError(
              `Invalid endpoint path ${pathEndpoint}`,
              SError.errorCodes.INVALID_RESOURCE_NAME);
          }

          // Get FunctionJSON
          let functionsObject;
          let endpointJson  = {};
          try {
            functionsObject = _this.readAndParseJsonSync(path.join(baseDir, pathFunctionRelative, 's-function.json'));
            let func        = functionsObject.functions[nameFunction];

            for (let i = 0; i < func.endpoints.length; i++) {
              let endpoint = func.endpoints[i];
              if (endpoint.path === endpointUrlPath && endpoint.method === endpointMethod) {
                endpointJson                        = endpoint;
                endpointJson.function               = func;
                endpointJson.function.name          = nameFunction;
                endpointJson.function.pathFunction  = path.join('back', 'modules', pathFunctionRelative);
              }
            }
          } catch(e) {
            console.log(e);
            throw new SError(`Invalid JSON in ${endpointUrlPath}`, SError.errorCodes.INVALID_RESOURCE_NAME);
          }

          // Get ModuleJSON
          let pathModule = path.join(baseDir, pathFunctionRelative.split(path.sep)[0], 's-module.json');
          let moduleJson;
          try {
            moduleJson = _this.readAndParseJsonSync(pathModule);
            moduleJson.pathModule = path.join('back', 'modules', pathFunctionRelative.split(path.sep)[0]);
          } catch(e) {
            throw new SError(`This endpoint has missing or invalid parent module JSON (s-module.json) ${endpointUrlPath} - ${pathModule}`,
              SError.errorCodes.INVALID_RESOURCE_NAME);
          }

          // Add attributes
          endpointJson.module = moduleJson;

          // Add to main array
          allEndpointJsons.push(endpointJson);

          // Callback
          return cb();

        }, function () {
          return resolve(allEndpointJsons);
        });
      });
    });
};

/**
 * getFunctionEnvVars
 * - Finds all Env Vars that are used by all Functions in a given Module
 */

exports.getFunctionEnvVars = function(projectRootPath, modName) {

  return this.getFunctions(path.join(projectRootPath, 'back', 'modules', modName), null)
    .then(function(functionJsons) {

      let envVars = [];
      functionJsons.forEach(function(functionJson) {

        if (functionJson.lambda && functionJson.lambda.envVar) {
          functionJson.lambda.envVar.forEach(function(envVar) {
            if (envVars.indexOf(envVar) == -1) {
              envVars.push(envVar);
            }
          });
        }
      });

      return envVars;
    });
};

/**
 * Write File
 * - Writes file and makes any parent dirs if necessary
 * @param filePath
 * @param contents node Buffer
 * @returns {Promise}
 */

exports.writeFile = function(filePath, contents) {
  this.sDebug('Writing file:', filePath);

  if (contents === undefined) {
    contents = '';
  }

  return mkdirpAsync(path.dirname(filePath))
    .then(function() {
      return fs.writeFileAsync(filePath, contents);
    });
};

/**
 * Generate Short ID
 * @param maxLen
 * @returns {string}
 */

exports.generateShortId = function(maxLen) {
  return shortid.generate().replace(/\W+/g, '').substring(0, maxLen).replace(/[_-]/g, '');
};

/**
 * Generate Project Bucket Name
 */

exports.generateProjectBucketName = function(projectDomain, bucketRegion) {

  // Sanitize
  projectDomain = projectDomain.trim().toLowerCase();

  return `serverless.${bucketRegion}.${projectDomain}`;
};


exports.dirExistsSync = function(path) {
  try {
    let stats = fs.statSync(path);
    return stats.isDirectory();
  }
  catch (e) {
    return false;
  }
};

exports.fileExistsSync = function(path) {
  try {
    let stats = fs.lstatSync(path);
    return stats.isFile();
  }
  catch (e) {
    return false;
  }
};

exports.readAndParseJsonSync = function(path) {
  return JSON.parse(fs.readFileSync(path));
};

exports.endsWith = function(str, suffix) {
  return str.indexOf(suffix, str.length - suffix.length) !== -1;
};

/**
 * NPM Install
 * - Programatically install NPM dependencies
 *
 * This function is here only for purpose of running testsuite.
 */

exports.npmInstall = function(dir) {
  process.chdir(dir);

  if (exec('npm install ', { silent: false }).code !== 0) {
    throw new SError(`Error executing NPM install on ${dir}`, SError.errorCodes.UNKNOWN);
  }

  process.chdir(process.cwd());
};

/**
 * Write to console.log if process.env.DEBUG is true
 * - If we ever want to get more complicated with log levels we should use winston
 */

let debuggerCache         = {};
exports.sDebugWithContext = function(context) {
  if (process.env.DEBUG) {
    context = `serverless:${context}`;
    if (!debuggerCache[context]) {
      debuggerCache[context] = rawDebug(context);
    }
    debuggerCache[context].apply(null, Array.prototype.slice.call(arguments, 1));
  }
};

exports.sDebug = function() {

  if (process.env.DEBUG) {
    let caller  = getCaller();
    let context = pathToContext(caller);
    let args    = Array.prototype.slice.call(arguments);
    args.unshift(context);
    this.sDebugWithContext.apply(this, args);
  }
};

exports.isStageNameValid = function(stageName) {
  return /^[a-zA-Z\d]+$/.test(stageName);
};

exports.isComponentNameValid = function(componentName) {
  return /^[\w-]{1,20}$/.test(componentName);
};

exports.isFunctionNameValid = function(functionName) {
  return /^[\w-]{1,20}$/.test(functionName);
};

exports.getModulePath = function(moduleName, componentName, projectRootPath) {
  return path.join(projectRootPath, componentName, moduleName);
};

exports.getModule = function(moduleName, componentName, projectRootPath) {
  return this.readAndParseJsonSync(
    path.join(this.getModulePath(moduleName, componentName, projectRootPath), 's-module.json')
  );
};

exports.getFunctionPath = function(functionName, componentName, projectRootPath) {
  return path.join(projectRootPath, componentName, functionName);
};

/*
  TODO: this code is obviously wrong (calls getFunctionPath incorrectly) and not used anywhere. To be removed?
exports.getFunction = function(functionName, projectRootPath) {
  return this.readAndParseJsonSync(
    path.join(this.getFunctionPath(functionName, projectRootPath), 's-function.json')
  );
};
*/

exports.doesComponentExist = function(componentName, projectRootPath) {
  return this.dirExistsSync(path.join(projectRootPath, componentName));
};

exports.doesFunctionExist = function(functionName, componentName, projectRootPath) {
  return this.dirExistsSync(this.getFunctionPath(functionName, componentName, projectRootPath));
};

/**
 * Populate
 * - Populates data: Project, Component or Function
 * - WARNING: strips nested class instances
 */

exports.populate = function(meta, templates, data, stage, region) {

  // Validate required params
  if (!meta || !templates || !data || !stage || !region) throw new SError(`Missing required params: Serverless, project, stage, region`);

  // Validate: Check stage exists
  if (typeof stage != 'undefined' && !meta.stages[stage]) throw new SError(`Stage doesn't exist`);

  // Validate: Check region exists in stage
  if (typeof region != 'undefined' && !meta.stages[stage].regions[region]) throw new SError(`Region doesn't exist in provided stage`);

  // Sanitize: Remove nested properties.  DO NOT populate these.  Rely on calling those classes getPopulated methods instead.
  if (data.components)  delete data.components;
  if (data.functions)   delete data.functions;
  if (data.endpoints)   delete data.endpoints;

  // Populate templates
  traverse(data).forEach(function (val) {

    let t = this;

    // check if the current string is a template $${...}
    if (typeof val === 'string' && val.match(/\$\${([^{}]*)}/g) != null) {

      let template = val.replace('$${', '').replace('}', '');

      // Module name syntax deprecated notice.
      if (template.indexOf('.') !== -1) {
        SCli.log('DEPRECATED: Including the module name $${moduleName.template} is no longer supported.  ' +
          'Instead, all templates are use only the template name $${template} whether they are located in s-templates.json files in the project root or module root.  ' +
          'Module level templates extend project level templates if there are duplicates.  You will need to change: ' + template);
      }

      if (!templates[template]) SCli.log('WARNING: the following template is requested but not defined: ' + template);

      // Replace
      if (templates[template]) t.update(templates[template]);
    }
  });

  // Populate variables
  traverse(data).forEach(function(val) {

    let t = this;

    // check if the current string is a variable ${...}
    if (typeof(val) === 'string' && val.match(/\${([^{}]*)}/g) != null && val.indexOf('$$') == -1) {

      // get all ${variable} in the string
      val.match(/\${([^{}]*)}/g).forEach(function(variableSyntax) {

        let variableName = variableSyntax.replace('${', '').replace('}', '');
        let value;

        if (meta.stages[stage].regions[region].variables[variableName]) {
          value = meta.stages[stage].regions[region].variables[variableName]
        } else if (meta.stages[stage].variables[variableName]) {
          value = meta.stages[stage].variables[variableName];
        } else if (meta.variables[variableName]) {
          value = meta.variables[variableName];
        }

        // Reserved Variables
        if (variableName === 'name' && data.name) value = data.name;

        // Populate
        if (!value && !value !== "") {
          SCli.log('WARNING: This variable is not defined: ' + variableName);
        } else {
          val = replaceall(variableSyntax, value, val);
        }
      });

      // Replace
      t.update(val);
    }
  });

  return data;
};


function pathToContext(path) {
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
}

function getCaller() {
  let stack = getStack();

  // Remove unwanted function calls on stack -- ourselves and our caller
  stack.shift();
  stack.shift();

  // Now the top of the stack is the CallSite we want
  // See this for available methods:
  //     https://code.google.com/p/v8-wiki/wiki/JavaScriptStackTraceApi
  let path = stack[0].getFileName();
  return path;
}

function getStack() {
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
}

/**
 * Persistent Request
 * - AWS often gives a 429 error (Too Many Requests)
 * - This is how we get around that
 */

exports.persistentRequest = function(f) {

  return new BbPromise(function(resolve, reject){
    let doCall = function(){
      f()
        .then(resolve)
        .catch(function(error) {

          if( error.statusCode == 429 ) {
            SUtils.sDebug("'Too many requests' received, sleeping 5 seconds");
            setTimeout( doCall, 5000 );
          } else
            reject( error );
        });
    };
    return doCall();
  });
};
