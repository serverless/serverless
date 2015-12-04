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
    SError     = require('../ServerlessError'),
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
 * Find all s-module json paths underneath given dir
 */

// TODO: Refactor this to be getModules and have it work like the getFunctions function
exports.findAllAwsmJsons = function(startPath) {
  return this.readRecursively(startPath, '*s-module.json')
      .then(function(jsonPaths) {
        return jsonPaths.map(function(jsonPath) {
          return path.resolve(path.join(startPath, jsonPath));
        });
      });
};

/**
 * Get Functions
 * - Resolve paths and return function JSONs
 * - If no paths specified, finds all functions in baseDir
 */

exports.getFunctions = function(baseDir, functionPaths) {

  let _this = this,
      functionJsons = [];
  
  return BbPromise.try(function () {

        // Sanitize baseDir
        if ((baseDir).indexOf('/back/') == -1) baseDir = path.join(baseDir, 'back');
        if ((baseDir).indexOf('/modules/') == -1) baseDir = path.join(baseDir, 'modules');

        // If no functionPaths, get functions by base directory
        if (!functionPaths || !functionPaths.length) {
          return _this.readRecursively(baseDir, '*s-function.json');
        } else {
          return functionPaths;
        }

      })
      .then(function(functionPaths) {
        return new BbPromise(function(resolve, reject){
          
          // Fetch Function JSONs
          async.eachLimit(functionPaths, 10, function (functionPath, cb) {

            // Resolve Path
            if ((functionPath.match(/\//g) || []).length < 3) {
              functionPath = path.resolve(baseDir, functionPath);
            }

            if (functionPath.indexOf('s-function.json') == -1) {
              functionPath = path.join(functionPath, 's-function.json');
            }

            // Check exists
            if (!_this.fileExistsSync(functionPath)) {
              throw new SError(
                  `Invalid function path ${functionPath}`,
                  SError.errorCodes.INVALID_RESOURCE_NAME);
            }

            // Get FunctionJSON
            let functionJson = _this.readAndParseJsonSync(functionPath);
            functionJson.path = functionPath;
            
            // Fetch JSON
            functionJsons.push(functionJson);
            return cb();
            
          }, function (error) {
            if (error) return reject(new SError(error.message));
            return resolve(functionJsons);
          });
        });
      });
};

/**
 * Finds all env let keys that are used by all lambdas in a given aws module
 */

exports.findAllEnvletsForAwsm = function(projectRootPath, modName) {
  let _this = this;
  
  return this.getFunctions(path.join(projectRootPath, 'back', 'modules', modName), null)
      .then(function(allAwsmJson) {
        let envletKeys = [];
        allAwsmJson.forEach(function(awsmJson) {
          
          //TODO: change to es6 set...
          if (awsmJson.lambda && awsmJson.lambda.envlets) {
            awsmJson.lambda.envlets.forEach(function(envlet) {
              if (envletKeys.indexOf(envlet) == -1) {
                envletKeys.push(envlet);
              }
            });
          }
        });
        
        return envletKeys;
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

exports.getProjRegionConfigForStage = function(projectJawsJson, stage, regionName) {
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

exports.npmInstall = function(dir) {
  let cwd = process.cwd();
  
  process.chdir(dir);
  if (exec('npm install ', {silent: false}).code !== 0) {
    throw new SError(`Error executing NPM install on ${dir}`, SError.errorCodes.UNKNOWN);
  }
  
  process.chdir(cwd);
};

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
 *
 * If we ever want to get more complicated with log levels we should use winston
 *
 * @param str
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
 * @param projectJawsJson
 * @param regionName
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
 * @param projectJawsJson
 * @param regionName
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
