'use strict';

/**
 * JAWS CLI: Utilities
 */

var Promise = require('bluebird'),
    path = require('path'),
    async = require('async'),
    readdirp = require('readdirp'),
    JawsError = require('../jaws-error'),
    fs = require('fs');

Promise.promisifyAll(fs);

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
      });
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

  return this.readRecursively(path.join(projectRootPath, 'back'), '*jaws.json')
      .then(function(jsonPaths) {
        return new Promise(function(resolve, reject) {

          var lambdas = [];

          // Check each file to ensure it is a lambda
          async.eachLimit(jsonPaths, 10, function(jsonPath, cb) {
                var lambdaJawsPath = path.join(projectRootPath, 'back', jsonPath),
                    json = require(lambdaJawsPath);

                if (typeof json.lambda !== 'undefined') lambdas.push(lambdaJawsPath);
                return cb();
              },

              function(error) {
                if (error) reject(error);
                resolve(lambdas);
              });
        });
      });
};

/**
 * Find all Endpoints
 * @param promise
 */
module.exports.findAllEndpoints = function(projectRootPath) {

  return this.readRecursively(projectRootPath, '*jaws.json')
      .then(function(jsonPaths) {
        return new Promise(function(resolve, reject){

          var endpoints = [];

          // Check each file to ensure it is a lambda
          async.eachLimit(jsonPaths, 10, function(jsonPath, cb) {

            var json = require(path.join(projectRootPath, jsonPath));
            if (typeof json.endpoint !== 'undefined') endpoints.push(jsonPath);
            return cb();

          }, function(error) {
            if (error) reject(error);
            resolve(endpoints);
          });
        });
      });
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
