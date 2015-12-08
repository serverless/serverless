'use strict';

/**
 * Serverless CLI: Utilities
 */

require('shelljs/global');
let BbPromise       = require('bluebird'),
    rawDebug      = require('debug'),
    path          = require('path'),
    async         = require('async'),
    readdirp      = require('readdirp'),
    SError        = require('../ServerlessError'),
    fs            = require('fs'),
    mkdirpAsync   = require('mkdirp-then'),
    shortid       = require('shortid'),
    expandHomeDir = require('expand-home-dir');

BbPromise.promisifyAll(fs);

/**
 * Find Project Root Path
 */

exports.findProjectRootPath = function(startDir) {

  let _this = this;
  
  // Check if startDir is root
  if (_this.fileExistsSync(path.join(startDir, 's-project.json'))) {
    
    let jawsJsonInDir = require(path.join(startDir, 's-project.json'));
    if (typeof jawsJsonInDir.name !== 'undefined') return path.resolve(startDir);
  }
  
  // Check up to 10 parent levels
  let previous     = './',
      projRootPath = false;
  
  for (let i = 0; i < 10; i++) {
    previous     = path.join(previous, '../');
    let fullPath = path.resolve(startDir, previous);
    
    if (_this.fileExistsSync(path.join(fullPath, 's-project.json'))) {
      let jawsJson = require(path.join(fullPath, 's-project.json'));
      if (typeof jawsJson.name !== 'undefined') {
        projRootPath = fullPath;
        break;
      }
    }
  }
  
  return projRootPath;
};

/**
 * Execute (Command)
 */

exports.execute = function(promise) {
  promise
      .catch(SError, function(e) {
        throw e;
        process.exit(e.messageId);
      })
      .error(function(e) {
        console.error(e);
        process.exit(1);
      })
      .done();
};

/**
 * Read Recursively
 */

exports.readRecursively = function(path, filter) {
  return new BbPromise(function(resolve, reject) {
    
    let files = [];
    
    readdirp({
      root:       path,
      fileFilter: filter,
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
 * Get Modules
 * - Find all s-module json paths underneath given dir
 */

exports.getModules = function(baseDir) {
  return this.readRecursively(baseDir, '*s-module.json')
      .then(function(jsonPaths) {
        return jsonPaths.map(function(jsonPath) {
          return path.resolve(path.join(baseDir, jsonPath));
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
 * Get Functions
 * - Resolve paths and return function JSONs
 * - If no paths specified, finds all functions in baseDir
 * - Each function must contain !# in path:  module/function!#get
 */

exports.getFunctions = function(baseDir, functionPaths) {

  let _this = this,
      allFunctionJsons = [];
  
  return BbPromise.try(function () {

        // Sanitize baseDir
        if ((baseDir).indexOf('/back/') == -1) baseDir = path.join(baseDir, 'back');
        if ((baseDir).indexOf('/modules/') == -1) baseDir = path.join(baseDir, 'modules');

        // If functionPaths, return them
        if (functionPaths) return functionPaths;

        // If no functionPaths, get all functions in project and create paths
        functionPaths = [];
        return _this.readRecursively(baseDir, '*s-function.json')
            .then(function(functionFilePaths) {

              for (let i = 0; i < functionFilePaths.length; i++) {

                // Read JSON
                let filePath        = functionFilePaths[i];
                let functionsObject = _this.readAndParseJsonSync(path.resolve(baseDir, filePath));
                functionsObject     = functionsObject.functions;
                filePath            = filePath.replace('/s-function.json', '');

                // Create paths for each function in s-function.json
                for (let j = 0; j < Object.keys(functionsObject).length; j++ ) {
                  functionPaths.push(filePath + '!#' + Object.keys(functionsObject)[j]);
                }
              }

              return functionPaths;
            });
      })
      .then(function(functionPaths) {
        return new BbPromise(function(resolve, reject){

          // Loop through function paths and process
          async.eachLimit(functionPaths, 10, function (functionPath, cb) {

            let functionKey = null;

            // Strip functionPath, functionKey & endpointKeys
            functionKey  = _this.returnPartial(functionPath, '!#', 1, null);
            functionPath = _this.returnPartial(functionPath, '!#', 0, functionPath); // Strip from functionPath

            // Check functionPath exists
            if (!functionKey) {
              throw new SError(`Missing function key in path: ${functionPath}`,
                  SError.errorCodes.INVALID_RESOURCE_NAME);
            }

            // Resolve functionPath if has less than 3 forward slashes
            if ((functionPath.match(/\//g) || []).length < 3) {
              functionPath = path.resolve(baseDir, functionPath);
            }

            // If functionPath has s-function.json missing, add it
            if (functionPath.indexOf('s-function.json') == -1) {
              functionPath = path.join(functionPath, 's-function.json');
            }

            // Check functionPath exists
            if (!_this.fileExistsSync(functionPath)) {
              throw new SError(
                  `Invalid function path ${functionPath}`,
                  SError.errorCodes.INVALID_RESOURCE_NAME);
            }

            // Get FunctionJSON
            let functionsObject;
            let functionJson;
            try {
              functionsObject = _this.readAndParseJsonSync(functionPath);
              functionJson    = functionsObject.functions[functionKey];
            } catch(e) {
              throw new SError(
                  `Invalid JSON in ${functionPath}`,
                  SError.errorCodes.INVALID_RESOURCE_NAME);
            }

            // Get ModuleJSON
            let modulePath = path.join(functionPath, '..', '..', 's-module.json');
            let moduleJson;
            try {
              moduleJson = _this.readAndParseJsonSync(modulePath);
            } catch(e) {
              throw new SError(
                  `This function has missing or invalid parent module JSON (s-module.json) ${functionPath} ${modulePath}`,
                  SError.errorCodes.INVALID_RESOURCE_NAME);
            }

            // Add attributes
            functionJson.name         = functionKey;
            functionJson.moduleName   = moduleJson.name;
            functionJson.runtime      = moduleJson.runtime;
            functionJson.profile      = moduleJson.profile;
            functionJson.pathFunction = functionPath;

            // Add to main array
            allFunctionJsons.push(functionJson);

            // Callback
            return cb();
            
          }, function (error) {
            if (error) return reject(new SError(error.message));
            return resolve(allFunctionJsons);
          });
        });
      });
};

/**
 * Get Endpoints
 * - Resolve paths and return endpoint JSONs
 * - If no paths specified, finds all endpoints in baseDir
 * - Each endpoint must contain !# and !@ in path:  module/function!#get!@get-data
 */

exports.getEndpoints = function(baseDir, endpointPaths) {

  let _this = this,
      allEndpointJsons = [];

  return BbPromise.try(function () {

        // Sanitize baseDir
        if ((baseDir).indexOf('/back/') == -1) baseDir = path.join(baseDir, 'back');
        if ((baseDir).indexOf('/modules/') == -1) baseDir = path.join(baseDir, 'modules');

        // If endpointPaths, return them
        if (endpointPaths) return endpointPaths;

        // If no functionPaths, get all functions in project and create paths
        endpointPaths = [];
        return _this.readRecursively(baseDir, '*s-function.json')
            .then(function(functionFilePaths) {

              for (let i = 0; i < functionFilePaths.length; i++) {

                // Read JSON
                let filePath        = functionFilePaths[i];
                let functionsObject = _this.readAndParseJsonSync(path.resolve(baseDir, filePath));
                functionsObject     = functionsObject.functions;
                filePath            = filePath.replace('/s-function.json', '');

                // Create paths for each function in s-function.json
                for (let j = 0; j < Object.keys(functionsObject).length; j++ ) {

                  let functionPath = filePath + '!#' + Object.keys(functionsObject)[j];
                  let funcObject = functionsObject[Object.keys(functionsObject)[j]];
                  for (let k = 0; k < Object.keys(funcObject.endpoints).length; k++) {
                    let endpointPath = functionPath + '!@' + Object.keys(funcObject.endpoints)[k];
                    endpointPaths.push(endpointPath);
                  }
                }
              }

              return endpointPaths;
            });
      })
      .then(function(endpointPaths) {
        return new BbPromise(function(resolve, reject){

          // Loop through function paths and process
          async.eachLimit(endpointPaths, 10, function (endpointPath, cb) {

            let functionKey = null,
                endpointKey = null;

            // Strip endpointPath, functionKey & endpointKeys
            functionKey  = _this.returnPartial(endpointPath, '!#', 1, null);
            endpointKey  = _this.returnPartial(functionKey, '!@', 1, null);
            functionKey  = _this.returnPartial(functionKey, '!@', 0, null); // String !@ from functionKey
            endpointPath = _this.returnPartial(endpointPath, '!#', 0); // Strip from functionPath

            // Check endpointKey exists
            if (!endpointKey) {
              throw new SError(`Missing function key in path: ${functionPath}`,
                  SError.errorCodes.INVALID_RESOURCE_NAME);
            }

            // Resolve endpointPath if has less than 3 forward slashes
            if ((endpointPath.match(/\//g) || []).length < 3) {
              endpointPath = path.resolve(baseDir, endpointPath);
            }

            // If endpointPath has s-function.json missing, add it
            if (endpointPath.indexOf('s-function.json') == -1) {
              endpointPath = path.join(endpointPath, 's-function.json');
            }

            // Check endpointPath exists
            if (!_this.fileExistsSync(endpointPath)) {
              throw new SError(
                  `Invalid endpoint path ${endpointPath}`,
                  SError.errorCodes.INVALID_RESOURCE_NAME);
            }

            // Get FunctionJSON
            let functionsObject;
            let endpointJson = {};
            try {
              functionsObject            = _this.readAndParseJsonSync(endpointPath);
              let func                   = functionsObject.functions[functionKey];
              endpointJson               = func.endpoints[endpointKey];
              endpointJson.path          = endpointKey;
              endpointJson.function      = func;
              endpointJson.function.name = functionKey;
            } catch(e) {
              console.log(e);
              throw new SError(
                  `Invalid JSON in ${endpointPath}`,
                  SError.errorCodes.INVALID_RESOURCE_NAME);
            }

            // Get ModuleJSON
            let modulePath = path.join(endpointPath, '..', '..', 's-module.json');
            let moduleJson;
            try {
              moduleJson = _this.readAndParseJsonSync(modulePath);
            } catch(e) {
              throw new SError(
                  `This endpoint has missing or invalid parent module JSON (s-module.json) ${endpointPath} ${modulePath}`,
                  SError.errorCodes.INVALID_RESOURCE_NAME);
            }

            // Add attributes
            endpointJson.moduleName   = moduleJson.name;
            endpointJson.runtime      = moduleJson.runtime;
            endpointJson.profile      = moduleJson.profile;
            endpointJson.pathEndpoint = endpointPath;

            // Add to main array
            allEndpointJsons.push(endpointJson);

            // Callback
            return cb();

          }, function (error) {
            if (error) return reject(new SError(error.message));
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

exports.generateShortId = function(maxLen) {
  return shortid.generate().replace(/\W+/g, '').substring(0, maxLen).replace(/[_-]/g, '');
};

/**
 * Generate JawsBucket Name
 */

exports.generateRegionBucketName = function(region, projectDomain) {
  
  // Sanitize
  region        = region.trim().replace(/-/g, '').toLowerCase();
  projectDomain = projectDomain.trim().toLowerCase();
  
  return `serverless.${region}.${projectDomain}`;
};

/**
 * Given list of project stage objects, extract given region
 */

exports.getRegionConfig = function(projectJawsJson, stage, regionName) {
  let projectStageObj = projectJawsJson.stages[stage];
  
  let region = projectStageObj.filter(regionObj => {
    return regionObj.region == regionName;
  });
  
  if (!region || region.length == 0) {
    throw new SError(`Could not find region ${regionName}`, SError.errorCodes.UNKNOWN);
  }
  
  if (region.length > 1) {
    throw new SError(`Multiple regions named ${regionName}`, SError.errorCodes.UNKNOWN);
  }
  
  return region[0];
};

exports.dirExistsSync = function(path) {
  try {
    let stats = fs.lstatSync(path);
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
 */

exports.npmInstall = function(dir) {
  process.chdir(dir);

  if (exec('npm install ', { silent: false }).code !== 0) {
    throw new SError(`Error executing NPM install on ${dir}`, SError.errorCodes.UNKNOWN);
  }
  
  process.chdir(process.cwd());
};

/**
 * Generate Resources CloudFormation Template
 */

exports.generateResourcesCf = function(projRootPath, projName, projDomain, stage, region, notificationEmail) {
  let cfTemplate                                    = require('../templates/resources-cf');
  cfTemplate.Parameters.aaProjectName.Default       = projName;
  cfTemplate.Parameters.aaProjectName.AllowedValues = [projName];
  cfTemplate.Parameters.aaProjectDomain.Default     = projDomain;
  
  cfTemplate.Parameters.aaStage.AllowedValues          = [stage];
  cfTemplate.Parameters.aaDataModelStage.AllowedValues = [stage];
  
  cfTemplate.Parameters.aaNotficationEmail.Default = notificationEmail;
  cfTemplate.Description                           = projName + ' resources';
  
  return this.writeFile(
      path.join(projRootPath, 'cloudformation', 'resources-cf.json'),
      JSON.stringify(cfTemplate, null, 2)
  );
};

/**
 * Write to console.log if process.env.DEBUG is true
 * - If we ever want to get more complicated with log levels we should use winston
 */

let debuggerCache            = {};
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

/**
 * Find Regional API
 * - Finds a project REST API ID that already exists
 */

exports.findRegionalApi = function(projectJawsJson, regionName) {
  
  for (let stages of Object.keys(projectJawsJson.stage)) {
    for (let i = 0; i < stages.length; i++) {
      if (stages[i].region === regionName && stages[i].restApiId) {
        return stages[i].restApiId;
      }
    }
  }
};

/**
 * Save Regional API
 * - Saves regional API to all stage that have this region
 */

exports.saveRegionalApi = function(projectJawsJson, regionName, restApiId, rootPath) {

  for (let stages of Object.keys(projectJawsJson.stages)) {
    for (let i = 0; i < projectJawsJson.stages[stages].length; i++) {
      if (projectJawsJson.stages[stages][i].region === regionName) {
        projectJawsJson.stages[stages][i].restApiId = restApiId;
      }
    }
  }

  fs.writeFileSync(path.join(rootPath, 'serverless.json'), JSON.stringify(projectJawsJson, null, 2));
};

function pathToContext(path) {
  // Match files under lib, tests, or bin so we only report the
  // relevant part of the file name as the context
  let pathRegex = /\/((lib|tests|bin)\/.*?)\.js$/i;
  let match     = pathRegex.exec(path);
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
