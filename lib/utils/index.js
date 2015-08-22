'use strict';

/**
 * JAWS CLI: Utilities
 */

var Promise = require('bluebird'),
  AWS = require('aws-sdk'),
  path = require('path'),
  os = require('os'),
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
  if (fs.existsSync(startDir + '/jaws.json')) {
    var jawsJsonInDir = require(startDir + '/jaws.json');
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
