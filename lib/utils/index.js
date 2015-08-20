'use strict';

/**
 * JAWS CLI: Utilities
 */

var Promise = require('bluebird'),
    fs = Promise.promisifyAll(require('fs'));

module.exports.findProjectRootPath = function(startDir) {

  // Defaults
  var previous = '/';

  // Check if startDir is root
  if (fs.existsSync(startDir + '/jaws.json')) {
    var jawsJsonInDir = require(startDir + '/jaws.json');
    if (jawsJsonInDir.profile === 'project') return startDir;
  }

  // Check up to 10 parent levels
  for (var i = 0; i < 10; i++) {

    previous = previous + '../';
    var fullPath = startDir + previous;

    if (fs.existsSync(fullPath + 'jaws.json')) {
      var jawsJson = require(fullPath + 'jaws.json');
      if (jawsJson.profile === 'project') return fullPath;
    }
  }

  return false;

};
