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

  // Defaults
  var previous = '/';

  // Check if startDir is root
  if (fs.existsSync(path.join(startDir, 'jaws.json'))) {
    var jawsJsonInDir = require(path.join(startDir, 'jaws.json'));
    if (jawsJsonInDir.profile === 'project') return path.resolve(startDir);
  }

  // Check up to 10 parent levels
  for (var i = 0; i < 10; i++) {

    previous = previous + '../';
    var fullPath = startDir + previous;

    if (fs.existsSync(fullPath + 'jaws.json')) {
      var jawsJson = require(fullPath + 'jaws.json');
      if (jawsJson.profile === 'project') return path.resolve(fullPath);
    }
  }

  return false;
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
 * @returns {Promise}
 */
module.exports.findAllLambdas = function(projectRootPath) {

  return this.readRecursively(path.join(projectRootPath, 'back'), '*jaws.json')
      .then(function(jsonPaths) {
        return new Promise(function(resolve, reject) {

          var lambdas = [];

          // Check each file to ensure it is a lambda
          async.eachLimit(jsonPaths, 10, function(jsonPath, cb) {
                var json = require(path.join(projectRootPath, jsonPath));
                if (json.profile === 'lambda' || typeof json.lambda !== 'undefined') lambdas.push(jsonPath);
                return cb();
              },

              function(error) {
                if (error) reject(error);
                resolve(lambdas);
              });
        });
      });
};
