'use strict';

/**
 * JAWS CLI: Utilities
 */

var Promise = require('bluebird'),
    path = require('path'),
    async = require('async'),
    readdirp = require('readdirp'),
    JawsError = require('../jaws-error'),
    fs = require('fs'),
    mkdirpAsync = require('mkdirp-then');

Promise.promisifyAll(fs);

/**
 * Find all jaws paths of given type
 *
 * @param projectRootPath
 * @param type lambda|api
 */
module.exports.findAllJawsPathsOfType = function(projectRootPath, type) {
  var _this = this,
      jawsJsonAttr;
  switch (type) {
    case 'lambda':
      jawsJsonAttr = 'lambda';
      break;
    case 'api':
      jawsJsonAttr = 'endpoint';
      break;
    default:
      return Promise.reject(new JawsError('Invalid type ' + type, JawsError.errorCodes.UNKNOWN));
      break;
  }

  return _this.readRecursively(path.join(projectRootPath, 'back'), '*jaws.json')
      .then(function(jsonPaths) {
        return new Promise(function(resolve, reject) {

          var jawsPathsOfType = [];

          // Check each file to ensure it is a lambda
          async.eachLimit(jsonPaths, 10, function(jsonPath, cb) {
                var lambdaJawsPath = path.join(projectRootPath, 'back', jsonPath),
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
module.exports.findProjectRootPath = function(startDir) {

  // Check if startDir is root
  if (fs.existsSync(path.join(startDir, 'jaws.json'))) {
    var jawsJsonInDir = require(path.join(startDir, 'jaws.json'));
    if (typeof jawsJsonInDir.project !== 'undefined') return path.resolve(startDir);
  }

  // Check up to 10 parent levels
  var previous = './',
      projRootPath = false;

  for (var i = 0; i < 10; i++) {
    previous = path.join(previous, '../');
    var fullPath = path.resolve(startDir, previous);

    if (fs.existsSync(path.join(fullPath, 'jaws.json'))) {
      var jawsJson = require(path.join(fullPath, 'jaws.json'));
      if (typeof jawsJson.project !== 'undefined') {
        projRootPath = fullPath;
        break;
      }
    }
  }

  return projRootPath;
};

/**
 * Handle exit
 *
 * @param promise
 */

module.exports.handleExit = function(promise) {
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
module.exports.readRecursively = function(path, filter) {
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
 * @returns {Promise} list of full paths to jaws.json files that are type lambda
 */
module.exports.findAllLambdas = function(projectRootPath) {
  return this.findAllJawsPathsOfType(projectRootPath, 'lambda');
};

/**
 * Find all dirs that are endpoints
 *
 * @param projectRootPath
 * @returns {Promise} list of full paths to jaws.json files that are type api
 */
module.exports.findAllEndpoints = function(projectRootPath) {
  return this.findAllJawsPathsOfType(projectRootPath, 'api');
};

/**
 * Find all jaws json paths underneath given dir
 *
 * @param startPath
 * @returns {Promise} list of full paths to jaws.json files
 */
module.exports.findAllJawsJsons = function(startPath) {
  return this.readRecursively(startPath, '*jaws.json')
      .then(function(jsonPaths) {
        return jsonPaths.map(function(jsonPath) {
          return path.resolve(path.join(startPath, jsonPath));
        });
      });
};

/**
 * Write to console.log if process.env.JAWS_VERBOSE is true
 *
 * If we ever want to get more complicated with log levels we should use winston
 *
 * @param str
 */
module.exports.logIfVerbose = function(str) {
  if (process.env.JAWS_VERBOSE) {
    console.log(str);
  }
};

/**
 * Writes file and makes any parent dirs if necessary
 *
 * @param filePath
 * @param contents node Buffer
 * @returns {Promise}
 */
module.exports.writeFile = function(filePath, contents) {
  return mkdirpAsync(path.dirname(filePath))
      .then(function() {
        return fs.writeFileAsync(filePath, contents);
      });
};

/**
 * Checks for duplicate lambda functionName's
 *
 * @param projectRootPath
 * @returns {Promise} list of lambdaJawsPaths
 */
module.exports.checkForDuplicateLambdaNames = function(projectRootPath) {
  var lambdaNameMap = {};

  return this.findAllLambdas(projectRootPath)
      .then(function(lambdaJawsPaths) {
        //Verify 2 lambdas dont have same name
        lambdaJawsPaths.forEach(function(ljp) {
          var ljpJson = require(ljp);

          if (lambdaNameMap[ljpJson.lambda.functionName]) {
            throw new JawsError(
                'Lambda named ' + ljpJson.lambda.functionName + ' exists twice in your project',
                JawsError.errorCodes.UNKNOWN
            );
          } else {
            lambdaNameMap[ljpJson.lambda.functionName] = true;
          }
        });

        return lambdaJawsPaths;
      });
};

/**
 * Gets all lambda functionName's
 *
 * @param projectRootPath
 * @returns {Promise} list of functionName's
 */
module.exports.getAllLambdaNames = function(projectRootPath) {
  var lambdaNames = [];

  return this.findAllLambdas(projectRootPath)
      .then(function(lambdaJawsPaths) {
        lambdaJawsPaths.forEach(function(ljp) {
          var ljpJson = require(ljp);

          lambdaNames.push(ljpJson.lambda.functionName);
        });

        return lambdaNames;
      });
};

/**
 * Given list of project stages objects, extract given region
 *
 * @param projectStageObj
 * @param region
 * @returns {*} region object for stage
 */
module.exports.getProjRegionConfig = function(projectStageObj, region) {
  var region = projectStageObj.filter(function(regionObj) {
    return regionObj.region == region;
  });

  if (!region || region.length == 0) {
    throw new JawsError('Could not find region ' + region, JawsError.errorCodes.UNKNOWN);
  }

  if (region.length > 1) {
    throw new JawsError('Multiple regions named ' + region, JawsError.errorCodes.UNKNOWN);
  }

  return region[0];
};
