'use strict';

/**
 * JAWS CLI: Utilities
 */
require('shelljs/global');
var Promise = require('bluebird'),
    rawDebug = require('debug'),
    path = require('path'),
    async = require('async'),
    readdirp = require('readdirp'),
    JawsError = require('../jaws-error'),
    fs = require('fs'),
    mkdirpAsync = require('mkdirp-then');

Promise.promisifyAll(fs);

/**
 * Find all awsm paths of given type
 *
 * @param projectRootPath
 * @param type lambda|endpoint
 */
exports.findAllAwsmPathsOfType = function(projectRootPath, type) {
  var _this = this,
      jawsJsonAttr;
  switch (type) {
    case 'lambda':
      jawsJsonAttr = 'lambda';
      break;
    case 'endpoint':
      jawsJsonAttr = 'apiGateway';
      break;
    default:
      return Promise.reject(new JawsError('Invalid type ' + type, JawsError.errorCodes.UNKNOWN));
      break;
  }

  return _this.readRecursively(projectRootPath, '*awsm.json')
      .then(function(jsonPaths) {
        return new Promise(function(resolve, reject) {

          var jawsPathsOfType = [];

          // Check each file to ensure it is a lambda
          async.eachLimit(jsonPaths, 10, function(jsonPath, cb) {
                var lambdaJawsPath = path.join(projectRootPath, jsonPath),
                    json = require(lambdaJawsPath);

                if (typeof json[jawsJsonAttr] !== 'undefined') jawsPathsOfType.push(lambdaJawsPath);
                return cb();
              },

              function(error) {
                if (error) reject(error);
                resolve(jawsPathsOfType);
              });
        });
      });
};

/**
 * Find project root path
 *
 * @param startDir
 * @returns {*}
 */
exports.findProjectRootPath = function(startDir) {
  var _this = this;

  // Check if startDir is root
  if (_this.fileExistsSync(path.join(startDir, 'jaws.json'))) {
    var jawsJsonInDir = require(path.join(startDir, 'jaws.json'));
    if (typeof jawsJsonInDir.name !== 'undefined') return path.resolve(startDir);
  }

  // Check up to 10 parent levels
  var previous = './',
      projRootPath = false;

  for (var i = 0; i < 10; i++) {
    previous = path.join(previous, '../');
    var fullPath = path.resolve(startDir, previous);

    if (_this.fileExistsSync(path.join(fullPath, 'jaws.json'))) {
      var jawsJson = require(path.join(fullPath, 'jaws.json'));
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
 *
 * @param promise
 */

exports.execute = function(promise) {
  promise
      .catch(JawsError, function(e) {
        console.error(e);
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
 * @param path
 * @param filter
 * @returns {Promise}
 */
exports.readRecursively = function(path, filter) {
  return new Promise(function(resolve, reject) {

    var files = [];

    readdirp({
      root: path,
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
 * Find all dirs that are lambdas
 *
 * @param projectRootPath
 * @returns {Promise} list of full paths to awsm.json files that are type lambda
 */
exports.findAllLambdas = function(projectRootPath) {
  return this.findAllAwsmPathsOfType(projectRootPath, 'lambda');
};

/**
 * Find all dirs that are endpoints
 *
 * @param projectRootPath
 * @returns {Promise} list of full paths to awsm.json files that are type endpoint
 */
exports.findAllEndpoints = function(projectRootPath) {
  return this.findAllAwsmPathsOfType(projectRootPath, 'endpoint');
};

/**
 * Find all awsm json paths underneath given dir
 *
 * @param startPath
 * @returns {Promise} list of full paths to awsm.json files
 */

exports.findAllAwsmJsons = function(startPath) {
  return this.readRecursively(startPath, '*awsm.json')
      .then(function(jsonPaths) {
        return jsonPaths.map(function(jsonPath) {
          return path.resolve(path.join(startPath, jsonPath));
        });
      });
};

/**
 * Writes file and makes any parent dirs if necessary
 *
 * @param filePath
 * @param contents node Buffer
 * @returns {Promise}
 */
exports.writeFile = function(filePath, contents) {
  this.jawsDebug('Writing file:', filePath);

  if (contents === undefined) {
    contents = '';
  }

  return mkdirpAsync(path.dirname(filePath))
      .then(function() {
        return fs.writeFileAsync(filePath, contents);
      });
};

/**
 * Generate Lambda Name
 * @param awsmJson
 * @returns {string}
 */

exports.generateLambdaName = function(awsmJson) {
  var handlerName = awsmJson.lambda.cloudFormation.Handler.replace('aws_modules', ''),
      resourceAction = handlerName.substr(0, handlerName.lastIndexOf('/'));

  //We prefix with an l to make sure the CloudFormation resource map index is unique
  //we will probably have API gateway resources in their own CF JSON but we dont want to
  //make that decsision until CF has API gateway support
  return 'l' + resourceAction.replace(/(\/|-|_)([a-z])/g, function(g) {
        return g[1].toUpperCase();
      });
};

/**
 * Generate JawsBucket Name
 * @param stage
 * @param region
 * @param projectDomain
 * @returns {string}
 */

exports.generateJawsBucketName = function(stage, region, projectDomain) {

  // Sanitize
  stage = stage.trim().toLowerCase();
  region = region.trim().replace(/-/g, '').toLowerCase();
  projectDomain = projectDomain.trim().toLowerCase();

  return 'jaws.' + stage + '.' + region + '.' + projectDomain;
};

/**
 * Gets all lambda functionName's
 *
 * @param projectRootPath
 * @returns {Promise} list of functionName's
 */
exports.getAllLambdaNames = function(projectRootPath) {
  var _this = this,
      lambdaNames = [];

  return this.findAllLambdas(projectRootPath)
      .then(function(lambdaAwsmPaths) {
        lambdaAwsmPaths.forEach(function(ljp) {
          var awsm = _this.readAndParseJsonSync(ljp),
              lambdaName = _this.generateLambdaName(awsm);

          lambdaNames.push(lambdaName);
        });

        return lambdaNames;
      });
};

/**
 * Given list of project stages objects, extract given region
 *
 * @param projectJawsJson
 * @param stage
 * @param regionName
 * @returns {*} region object for stage
 */

exports.getProjRegionConfigForStage = function(projectJawsJson, stage, regionName) {

  var projectStageObj = projectJawsJson.stages[stage];

  var region = projectStageObj.filter(function(regionObj) {
    return regionObj.region == regionName;
  });

  if (!region || region.length == 0) {
    throw new JawsError('Could not find region ' + regionName, JawsError.errorCodes.UNKNOWN);
  }

  if (region.length > 1) {
    throw new JawsError('Multiple regions named ' + regionName, JawsError.errorCodes.UNKNOWN);
  }

  return region[0];
};

exports.dirExistsSync = function(path) {
  try {
    var stats = fs.lstatSync(path);
    return stats.isDirectory();
  }
  catch (e) {
    return false;
  }
};

exports.fileExistsSync = function(path) {
  try {
    var stats = fs.lstatSync(path);
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
  var cwd = process.cwd();

  process.chdir(dir);
  if (exec('npm install ', {silent: false}).code !== 0) {
    throw new JawsError('Error executing NPM install on ' + dir, JawsError.errorCodes.UNKNOWN);
  }

  process.chdir(cwd);
};

exports.generateResourcesCf = function(projRootPath, projName, projDomain, stage, region, notificationEmail) {
  var cfTemplate = require('../templates/resources-cf');
  cfTemplate.Parameters.aaProjectName.Default = projName;
  cfTemplate.Parameters.aaProjectName.AllowedValues = [projName];
  cfTemplate.Parameters.aaProjectDomain.Default = projDomain;
  cfTemplate.Parameters.aaStage.Default = stage;
  cfTemplate.Parameters.aaDataModelPrefix.Default = stage; //to simplify bootstrap use same stage
  cfTemplate.Parameters.aaNotficationEmail.Default = notificationEmail;
  cfTemplate.Description = projName + " resources";

  return this.writeFile(
      path.join(projRootPath, 'cloudformation', stage, region, 'resources-cf.json'),
      JSON.stringify(cfTemplate, null, 2)
  );
};

/**
 * Write to console.log if process.env.JAWS_VERBOSE is true
 *
 * If we ever want to get more complicated with log levels we should use winston
 *
 * @param str
 */

var debuggerCache = {};
exports.jawsDebugWithContext = function(context) {
  if (process.env.DEBUG) {
    context = 'jaws:' + context;

    if (!debuggerCache[context]) {
      debuggerCache[context] = rawDebug(context);
    }

    debuggerCache[context].apply(null, Array.prototype.slice.call(arguments, 1));
  }
};

exports.jawsDebug = function() {
  if (process.env.DEBUG) {
    var caller = getCaller();
    var context = pathToContext(caller);
    var args = Array.prototype.slice.call(arguments);
    args.unshift(context);
    this.jawsDebugWithContext.apply(this, args);
  }
};

function pathToContext(path) {
  // Match files under lib, tests, or bin so we only report the
  // relevant part of the file name as the context
  var pathRegex = /\/((lib|tests|bin)\/.*?)\.js$/i;
  var match = pathRegex.exec(path);
  if (match.length >= 2) {
    return match[1].replace(/[\/\\]/g, '.');
  } else {
    return path;
  }
}

function getCaller() {
  var stack = getStack();

  // Remove unwanted function calls on stack -- ourselves and our caller
  stack.shift();
  stack.shift();

  // Now the top of the stack is the CallSite we want
  // See this for available methods:
  //     https://code.google.com/p/v8-wiki/wiki/JavaScriptStackTraceApi
  var path = stack[0].getFileName();
  return path;
}

function getStack() {
  // Save original Error.prepareStackTrace
  var origPrepareStackTrace = Error.prepareStackTrace;

  // Override with function that just returns `stack`
  Error.prepareStackTrace = function(_, stack) {
    return stack;
  };

  var err = new Error();

  // Get `err.stack`, which calls our new `Error.prepareStackTrace`
  var stack = err.stack;

  // Restore original `Error.prepareStackTrace`
  Error.prepareStackTrace = origPrepareStackTrace;

  // Remove ourselves from the stack
  stack.shift();

  return stack;
}

/**
 * Init Runtime
 * - Checks for/creates a package manager file for the runtime param
 * - Installs jaws-core
 */

exports.initRuntime = function(JAWS, runtime) {

  var _this = this;

  if (runtime === 'nodejs') {

    // Check if package.json exists at project root
    if (!utils.fileExistsSync(path.join(JAWS._meta.projectRootPath, 'package.json'))) {

      // Create package.json
      var packageJsonTemplate = require('../templates/nodejs/package.json');
      packageJsonTemplate.name = JAWS._meta.projectJson.name;
      return fs.writeFileAsync(JAWS._meta.projectRootPath, packageJsonTemplate);

    }
  }
};
