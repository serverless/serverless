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
    shortid       = require('shortid');

BbPromise.promisifyAll(fs);

/**
 * Supported Runtimes
 */

module.exports.supportedRuntimes = {
  nodejs: {
    defaultPkgMgr: 'npm',
    validPkgMgrs:  ['npm'],
  },
};

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
 * - Each function must contain # in path:  module/function#get
 */

exports.getFunctions = function(baseDir, functionPaths) {

  let _this = this,
      allFunctionJsons = [];

  return BbPromise.try(function () {

        // Sanitize baseDir
        if ((baseDir).indexOf('/back') == -1) baseDir = path.join(baseDir, 'back');
        if ((baseDir).indexOf('/modules') == -1) baseDir = path.join(baseDir, 'modules');

        // If functionPaths, validate and return them
        if (functionPaths) {

          // Validate - ensure functionPath contains #
          for (let i = 0; i < functionPaths.length; i++) {
            let path = functionPaths[i];

            if (path.indexOf('#') === -1) {
              throw new SError(`Function path is missing '#' : ${path}`,
                  SError.errorCodes.INVALID_RESOURCE_NAME);
            }

            // If absolute path, trim to be relative
            if (path.indexOf('/back/modules') === -1) {
              path = path.split('back/modules/')[1];
            }
          }

          return functionPaths;
        }

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
                  functionPaths.push(filePath + '#' + Object.keys(functionsObject)[j]);
                }
              }

              return functionPaths;
            });
      })
      .then(function(functionPaths) {
        return new BbPromise(function(resolve, reject){

          // Loop through function paths and process
          async.eachLimit(functionPaths, 10, function (functionPath, cb) {

            // Strip functionPath, functionKey & endpointKeys
            let functionKey           = _this.returnPartial(functionPath, '#', 1);
            let pathFunctionRelative  = _this.returnPartial(functionPath, '#', 0);

            // Check functionPath exists
            if (!_this.fileExistsSync(path.join(baseDir, pathFunctionRelative, 's-function.json'))) {
              throw new SError(`Invalid function path ${functionPath}`, SError.errorCodes.INVALID_RESOURCE_NAME);
            }

            // Get FunctionJSON
            let functionsObject;
            let functionJson;
            try {
              functionsObject = _this.readAndParseJsonSync(path.join(baseDir, pathFunctionRelative, 's-function.json'));
              functionJson    = functionsObject.functions[functionKey];
            } catch(e) {
              throw new SError(`Invalid JSON in ${functionPath}`, SError.errorCodes.INVALID_RESOURCE_NAME);
            }

            // Get ModuleJSON
            let moduleJson;
            try {
              moduleJson = _this.readAndParseJsonSync(path.join(baseDir, functionPath.split('/')[0], 's-module.json'));
            } catch(e) {
              throw new SError(
                  `This function has missing or invalid parent module JSON (s-module.json) ${functionPath}`,
                  SError.errorCodes.INVALID_RESOURCE_NAME);
            }

            // Add attributes
            functionJson.name         = functionKey;
            functionJson.module       = moduleJson;
            functionJson.pathFunction = path.join('back', 'modules', pathFunctionRelative);;

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
 * - Return endpoint JSONs
 * - If no paths specified, finds all endpoints in baseDir
 * - Each endpoint must contain #, @ and ~ in path:  module/function#get@get-data~GET
 */

exports.getEndpoints = function(baseDir, endpointPaths) {

  let _this = this,
      allEndpointJsons = [];

  return BbPromise.try(function () {

        // Sanitize baseDir
        if ((baseDir).indexOf('/back') == -1) baseDir = path.join(baseDir, 'back');
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

              for (let i = 0; i < functionFilePaths.length; i++) {

                // Read JSON
                let filePath        = functionFilePaths[i];
                let functionsObject = _this.readAndParseJsonSync(path.resolve(baseDir, filePath));
                functionsObject     = functionsObject.functions;
                filePath            = filePath.replace('/s-function.json', '');

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
            let pathModule = path.join(baseDir, pathFunctionRelative.split('/')[0], 's-module.json');
            let moduleJson;
            try {
              moduleJson = _this.readAndParseJsonSync(pathModule);
              moduleJson.pathModule = path.join('back', 'modules', pathFunctionRelative.split('/')[0]);
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
  let cfTemplate                                     = require('../templates/resources-cf');

  cfTemplate.Parameters.ProjectName.Default          = projName;
  cfTemplate.Parameters.ProjectName.AllowedValues    = [projName];
  cfTemplate.Parameters.ProjectDomain.Default        = projDomain;

  cfTemplate.Parameters.Stage.AllowedValues          = [stage];
  cfTemplate.Parameters.DataModelStage.AllowedValues = [stage];

  cfTemplate.Parameters.NotificationEmail.Default     = notificationEmail;
  cfTemplate.Description                             = projName + ' resources';

  return this.writeFile(
      path.join(projRootPath, 'cloudformation', 'resources-cf.json'),
      JSON.stringify(cfTemplate, null, 2)
  );
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

  fs.writeFileSync(path.join(rootPath, 's-project.json'), JSON.stringify(projectJawsJson, null, 2));
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


exports.supportedRuntimes = {
  nodejs: {
    defaultPkgMgr: 'npm',
    validPkgMgrs:  ['npm'],
    templateSubDir: 'nodejs',
    templateHandler: 'handler.js',
    templateLibFile: 'index.js'
  },
  "python2.7": {
    defaultPkgMgr: 'pip',
    validPkgMgrs:  ['pip'],
    templateSubDir: 'python2.7',
    templateHandler: 'handler.py',
    templateLibFile: '__init__.py'
  }
};
